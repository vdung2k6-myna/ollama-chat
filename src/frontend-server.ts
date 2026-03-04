import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import cors from 'cors';

// Import our new middleware and utilities
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger, requestSizeLimit, sanitizeHeaders } from './middleware/security';
import { sanitizeInput } from './middleware/validation';

dotenv.config();

const app: Express = express();
const PUBLIC_DIR = path.join(__dirname, '../public');
const BACKEND_URL = process.env['BACKEND_URL'];

// Configure CORS for frontend server
const corsOptions = {
    origin: function (origin: string | undefined, callback: any) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // List of allowed origins
        const allowedOrigins = [
            `${config.frontend.host}:${config.frontend.port}`,
            'https://deep-chat-ui.onrender.com',  // Add the render.com domain
            'https://realtime-chat-supabase-react-master.onrender.com',  // Add the frontend render.com domain
            'https://github.com',  // Allow GitHub OAuth redirects
            'https://*.github.com',  // Allow GitHub subdomains
            'https://supabase.co',  // Allow Supabase connections
            'https://*.supabase.co',  // Allow Supabase subdomains
        ];
        
        // Allow any subdomain of onrender.com for flexibility
        if (origin.includes('.onrender.com')) {
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Access-Control-Allow-Origin'],
    optionsSuccessStatus: 200
};

// Security middleware (applied first)
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(rateLimitMiddleware);
app.use(requestLogger);
app.use(requestSizeLimit);
app.use(sanitizeHeaders);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Validate required configuration
if (!BACKEND_URL) {
    logger.error('ERROR: BACKEND_URL environment variable is required');
    logger.error('Please set BACKEND_URL in your .env file');
    process.exit(1);
}

// Log initial configuration
logger.info('Frontend Server Configuration:', {
    frontend: `${config.frontend.host}:${config.frontend.port}`,
    backendUrl: BACKEND_URL,
    staticFiles: PUBLIC_DIR
});

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

// Serve node_modules for locally installed libraries with proper MIME types
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules'), {
    setHeaders: (res, path) => {
        // More robust JavaScript file detection to fix MIME type errors
        const pathLower = path.toLowerCase();
        if (pathLower.endsWith('.js') || pathLower.includes('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (pathLower.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (pathLower.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (pathLower.endsWith('.map')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Serve index.html for all other routes (SPA support)
app.use((req: Request, res: Response) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    
    // Check if file exists
    if (!fs.existsSync(indexPath)) {
        console.error(`index.html not found at ${indexPath}`);
        return res.status(404).send('index.html not found');
    }
    
    res.sendFile(indexPath);
    return;
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(config.frontend.port, () => {
    logger.info(`Frontend server started successfully`, {
        port: config.frontend.port,
        environment: config.server.nodeEnv,
        backendUrl: BACKEND_URL
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
