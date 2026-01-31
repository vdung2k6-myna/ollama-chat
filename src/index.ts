import express, { Express, Request, Response } from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'https://myna.ddns.net:8080';
const HTTP_LOCAL_HOST = process.env.HTTP_LOCAL_HOST || 'http://localhost';
const HTTP_LOCAL_PORT = process.env.HTTP_LOCAL_PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

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