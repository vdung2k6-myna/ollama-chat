const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

app.get('/models', async (req, res) => {
    try {
        const response = await fetch('https://myna.ddns.net:8080/api/tags');
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

app.post('/chat', async (req, res) => {
    const { message, model } = req.body;

    try {
        const response = await fetch('https://myna.ddns.net:8080/api/generate', {
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

        console.log('Ollama API Response Status:', response.status, response.statusText);
        console.log('Ollama API Response OK:', response.ok);
        console.log('Ollama API Content-Type:', response.headers.get('Content-Type'));

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

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});