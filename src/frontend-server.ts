import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app: Express = express();
const FRONTEND_HOST = process.env.FRONTEND_HOST || 'http://localhost';
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '3000');
const PUBLIC_DIR = path.join(__dirname, '../public');

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
