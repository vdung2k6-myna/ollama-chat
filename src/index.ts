import express, { Express, Request, Response } from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Import our new middleware and utilities
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger, requestSizeLimit, sanitizeHeaders } from './middleware/security';
import { sanitizeInput } from './middleware/validation';
import healthRoutes from './routes/health';

dotenv.config();

const app: Express = express();

// Initialize Supabase client with cookie options for PKCE flow
const supabaseUrl = process.env['SUPABASE_URL'] || '';
const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'] || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
    }
});

// Security middleware (applied first)
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(rateLimitMiddleware);
app.use(requestLogger);
app.use(requestSizeLimit);
app.use(sanitizeHeaders);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Health check routes (no authentication required)
app.use('/health', healthRoutes);

app.get('/models', async (_req: Request, res: Response) => {
    try {
        const response = await fetch(`${config.ollama.baseUrl}/api/tags`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        logger.error('Error fetching models:', error);
        res.status(500).send('Error fetching models from Ollama');
    }
});

// Supabase Auth Endpoints
app.post('/auth/signup', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // Supabase signup might not return a session if email confirmation is required
        // Still return the user data
        if (!data || !data.user) {
            return res.status(400).json({ error: 'Signup failed: Invalid response from Supabase' });
        }

        // If there's no session, it means email confirmation is required
        if (!data.session) {
            return res.status(200).json({ 
                user: data.user, 
                session: null,
                message: 'Signup successful. Please check your email to confirm your account.' 
            });
        }

        return res.json({ user: data.user, session: data.session });
    } catch (error) {
        console.error('Error in signup:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/auth/signin', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // If email and password provided, use password login
        if (email && password) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                console.error('Supabase signin error:', error);
                return res.status(400).json({ error: error.message });
            }

            if (!data || !data.user || !data.session) {
                console.error('Signin response missing data:', { data });
                return res.status(400).json({ error: 'Signin failed: Invalid response from Supabase' });
            }

            return res.json({ user: data.user, session: data.session });
        }

        // Otherwise, return error
        console.warn('Signin attempt without email and password');
        return res.status(400).json({ error: 'Email and password are required' });
    } catch (error) {
        console.error('Error in signin:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/auth/signout', async (_req: Request, res: Response) => {
    try {
        const { access_token: _access_token } = _req.body;
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.json({ message: 'Successfully signed out' });
    } catch (error) {
        console.error('Error in signout:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/auth/user', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }

        const token = authHeader.split(' ')[1];
        const { data, error } = await supabase.auth.getUser(token);

        if (error) {
            return res.status(401).json({ error: error.message });
        }

        return res.json({ user: data.user });
    } catch (error) {
        console.error('Error getting user:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GitHub OAuth endpoint - returns Supabase credentials for client-side auth
app.get('/auth/github', async (_req: Request, res: Response) => {
    try {
        // Use the same CORS configuration as other endpoints
        // Don't override with wildcard origin since we need credentials
        // The global CORS middleware will handle this
        
        // Return Supabase credentials so frontend can handle OAuth
        return res.json({ 
            supabaseUrl: supabaseUrl,
            supabaseAnonKey: supabaseAnonKey,
            redirectTo: `${config.frontend.host}:${config.frontend.port}/`
        });
    } catch (error) {
        console.error('Error in GitHub auth:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Handle preflight OPTIONS requests for all routes
app.options('*', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(200).end();
});

app.post('/chat', async (req: Request, res: Response) => {
    const { message, model, messages, systemMessage } = req.body;

    try {
        // Build messages array for chat API
        const chatMessages: Array<{ role: string; content: string }> = [];

        // Add system message if provided
        if (systemMessage && systemMessage.trim() !== '') {
            chatMessages.push({ role: 'system', content: systemMessage });
        }

        // Add conversation messages
        if (messages && messages.length > 0) {
            chatMessages.push(...messages);
        } else {
            chatMessages.push({ role: 'user', content: message });
        }

        const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: chatMessages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error from Ollama API:', errorData);
            return res.status(response.status).send(errorData.error || 'Error from Ollama API');
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Handle streaming with proper chunk parsing
        let buffer = '';
        response.body.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                res.write(line + '\n');

                // Check if this chunk indicates the stream is done
                try {
                    const data = JSON.parse(line);
                    if (data.done) {
                        res.end();
                        return;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        });

        response.body.on('end', () => {
            // Process any remaining data in buffer
            if (buffer.trim() !== '') {
                res.write(buffer);
            }
            res.end();
        });
        
        // Return undefined to satisfy TypeScript - the response is handled by event listeners
        return;
    } catch (error) {
        console.error('Error in /chat endpoint:', error);
        return res.status(500).send('Error connecting to Ollama API');
    }
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(config.server.port, () => {
    logger.info(`Server started successfully`, {
        port: config.server.port,
        environment: config.server.nodeEnv,
        ollamaUrl: config.ollama.baseUrl
    });
    
    // Log important configuration info
    if (config.server.nodeEnv === 'production') {
        logger.warn('Running in production mode - ensure proper environment variables are set');
    }
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
