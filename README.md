# Ollama Chat

A web-based chat interface for interacting with local Ollama language models.

## Features

- Chat with local Ollama models
- Streaming responses
- Conversation history
- Model selection
- System messages
- User authentication with Supabase
- Support for email and GitHub login

## Authentication

This application now supports user authentication using Supabase:

1. **Email & Password Login**: Users can create accounts and login with email/password
2. **GitHub Login**: Users can login with their GitHub accounts

### Setup Supabase Authentication

1. Create a [Supabase](https://supabase.com/) project
2. Enable Email and GitHub authentication methods in your Supabase project
3. Add your Supabase URL and Anon Key to the `.env` file:
   ```
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Usage

1. Access the application in your browser
2. Login with email/password or GitHub
3. Select a model from the dropdown
4. Enter system messages if needed
5. Start chatting with your Ollama models

## Development

To run in development mode:
```bash
npm run dev
```

## Technologies Used

- Node.js with Express
- TypeScript
- Supabase for authentication
- Ollama API
- HTML/CSS/JavaScript frontend