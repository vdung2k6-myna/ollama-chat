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
    const { message, model } = req.body;

    try {
        const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                prompt: message,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error from Ollama API:', errorData);
            return res.status(response.status).send(errorData.error || 'Error from Ollama API');
        }

        console.log('Piping Ollama response to client.');
        response.body.pipe(res);
    } catch (error) {
        console.error('Error in /chat endpoint:', error);
        res.status(500).send('Error connecting to Ollama API');
    }
});

app.listen(HTTP_LOCAL_PORT, () => {
    console.log(`Server is running on ${HTTP_LOCAL_HOST}:${HTTP_LOCAL_PORT}`);
});