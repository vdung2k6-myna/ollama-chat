import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

dotenv.config();

const app: Express = express();
const FRONTEND_HOST = process.env.FRONTEND_HOST || 'http://localhost';
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '3000');
const PUBLIC_DIR = path.join(__dirname, '../public');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// Log initial configuration
console.log('Frontend Server Configuration:');
console.log(`  Frontend: ${FRONTEND_HOST}:${FRONTEND_PORT}`);
console.log(`  Backend URL: ${BACKEND_URL}`);
console.log(`  Static files: ${PUBLIC_DIR}`);

// Proxy API requests to backend (so /chat, /auth, /models, /config, /api go to BACKEND_URL)
const proxyPrefixes = ['/chat', '/auth', '/models', '/config', '/api'];
app.use(async (req: Request, res: Response, next) => {
    if (!proxyPrefixes.some(p => req.path.startsWith(p))) {
        return next();
    }

    const target = BACKEND_URL + req.originalUrl;
    console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${target}`);
    
    try {
        const headers: any = { ...req.headers };
        delete headers.host;

        const method = req.method;
        const fetchOptions: any = { method, headers };

        if (method !== 'GET' && method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(Buffer.from(chunk));
            }
            if (chunks.length > 0) {
                fetchOptions.body = Buffer.concat(chunks);
            }
        }

        const backendResp = await fetch(target, fetchOptions as any);
        console.log(`[PROXY] Response: ${backendResp.status}`);
        
        res.status(backendResp.status);
        backendResp.headers.forEach((value, name) => res.setHeader(name, value));
        
        if (backendResp.body) {
            // backendResp.body can be a Node Readable or a WHATWG ReadableStream
            const bodyAny: any = backendResp.body;
            if (typeof bodyAny.pipe === 'function') {
                bodyAny.pipe(res);
            } else if (typeof (Readable as any).fromWeb === 'function' && typeof bodyAny.getReader === 'function') {
                // Convert web ReadableStream to Node Readable
                const nodeStream = (Readable as any).fromWeb(bodyAny);
                nodeStream.pipe(res);
            } else {
                // Fallback: collect text and send
                const text = await backendResp.text();
                res.send(text);
            }
        } else {
            const text = await backendResp.text();
            res.send(text);
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[PROXY ERROR] ${target}:`, errorMsg);
        res.status(502).json({ 
            error: 'Bad Gateway',
            message: `Could not reach backend at ${BACKEND_URL}`,
            details: errorMsg
        });
    }
});

// Serve static files from public directory
app.use(express.static(PUBLIC_DIR));

// Serve index.html for all other routes (SPA support)
app.use((req: Request, res: Response) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    
    // Check if file exists
    if (!fs.existsSync(indexPath)) {
        console.error(`index.html not found at ${indexPath}`);
        return res.status(404).send('index.html not found');
    }
    
    // Read and inject BACKEND_URL into HTML
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    let html = fs.readFileSync(indexPath, 'utf-8');
    html = html.replace(
        '<script>\n        // Set backend URL - configure via window.BACKEND_URL or it defaults to http://localhost:5000\n        window.BACKEND_URL = window.BACKEND_URL || \'http://localhost:5000\';\n    </script>',
        `<script>\n        window.BACKEND_URL = '${backendUrl}';\n    </script>`
    );
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

app.listen(FRONTEND_PORT, () => {
    console.log(`Frontend server running at ${FRONTEND_HOST}:${FRONTEND_PORT}`);
    console.log(`Serving files from: ${PUBLIC_DIR}`);
});
