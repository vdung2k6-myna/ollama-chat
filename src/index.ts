import express, { Express, Request, Response } from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app: Express = express();
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'https://myna.ddns.net:8080';
const HTTP_LOCAL_HOST = process.env.HTTP_LOCAL_HOST || 'http://localhost';
const HTTP_LOCAL_PORT = process.env.HTTP_LOCAL_PORT || 3000;
const SERVER_HOST = `${HTTP_LOCAL_HOST}:${HTTP_LOCAL_PORT}`;

// Initialize Supabase client with cookie options for PKCE flow
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
    }
});

app.use(express.json());
app.use(cors());

app.get('/models', async (req: Request, res: Response) => {
    try {
        const response = await fetch(`${OLLAMA_API_URL}/api/tags`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching models:', error);
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

        res.json({ user: data.user, session: data.session });
    } catch (error) {
        console.error('Error in signup:', error);
        res.status(500).json({ error: 'Internal server error' });
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

            res.json({ user: data.user, session: data.session });
            return;
        }

        // Otherwise, return error
        console.warn('Signin attempt without email and password');
        return res.status(400).json({ error: 'Email and password are required' });
    } catch (error) {
        console.error('Error in signin:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/auth/signout', async (req: Request, res: Response) => {
    try {
        const { access_token } = req.body;
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({ message: 'Successfully signed out' });
    } catch (error) {
        console.error('Error in signout:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        res.json({ user: data.user });
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GitHub OAuth endpoint - returns Supabase credentials for client-side auth
app.get('/auth/github', async (req: Request, res: Response) => {
    try {
        // Return Supabase credentials so frontend can handle OAuth
        res.json({ 
            supabaseUrl: supabaseUrl,
            supabaseAnonKey: supabaseAnonKey,
            redirectTo: '/'
        });
    } catch (error) {
        console.error('Error in GitHub auth:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// simple configuration endpoint used by the front-end to pick up
// environment-specific values such as the server host.  the client
// will load this once on startup and then prepend it to subsequent
// API calls if set.
app.get('/config', (req: Request, res: Response) => {
    res.json({
        apiHost: SERVER_HOST
    });
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

        const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
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
    } catch (error) {
        console.error('Error in /chat endpoint:', error);
        res.status(500).send('Error connecting to Ollama API');
    }
});

app.listen(HTTP_LOCAL_PORT, () => {
    console.log(`Server is running on ${HTTP_LOCAL_HOST}:${HTTP_LOCAL_PORT}`);
});