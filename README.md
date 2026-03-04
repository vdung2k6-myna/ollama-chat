# Ollama Chat

A web-based chat interface for interacting with local Ollama language models, featuring a dual-server architecture with authentication and streaming responses.

## Features

- **Dual-Server Architecture**: Separate backend API server and frontend server for better scalability
- **Chat with local Ollama models** with streaming responses
- **Conversation history** with context-aware responses
- **Model selection** from available Ollama models
- **System messages** to guide AI behavior
- **User authentication** with Supabase (Email/Password + GitHub OAuth)
- **Real-time streaming** with Markdown rendering
- **Responsive UI** with draggable split-pane layout
- **Security features**: CORS, rate limiting, input sanitization, security headers

## Architecture

This project uses a **dual-server architecture**:

- **Backend Server** (port 5000): Handles API routes, authentication, and Ollama communication
- **Frontend Server** (port 3000): Serves static files and proxies API requests to backend

This separation allows for:
- Better scalability and deployment flexibility
- Independent frontend/backend hosting
- Proper CORS handling for multi-host deployments

## Authentication

This application supports user authentication using Supabase:

1. **Email & Password Login**: Users can create accounts and login with email/password
2. **GitHub OAuth**: Users can login with their GitHub accounts (PKCE flow)

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
3. Create `.env` file from `.env.example` and configure your settings
4. Build the project:
   ```bash
   npm run build
   ```
5. Start both servers:
   ```bash
   npm run dev  # Starts both backend and frontend servers
   ```
   Or start individually:
   ```bash
   npm run dev:backend  # Backend server on port 5000
   npm run dev:frontend # Frontend server on port 3000
   ```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Ollama API Configuration
OLLAMA_API_URL=https://your-ollama-server:port

# Backend Server Configuration  
HTTP_LOCAL_HOST=http://localhost
HTTP_LOCAL_PORT=5000

# Frontend Server Configuration
FRONTEND_HOST=http://localhost
FRONTEND_PORT=3000

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend URL (for frontend to connect to backend)
BACKEND_URL=http://localhost:5000
```

### Multi-Host Deployment

For deployment to platforms like Render.com:

1. Deploy backend server to one service
2. Deploy frontend server to another service
3. Update `BACKEND_URL` in frontend environment to point to backend service
4. Configure CORS origins in environment variables

## Usage

1. Access the frontend server in your browser (default: http://localhost:3000)
2. Login with email/password or GitHub
3. Select a model from the dropdown in the settings pane
4. Enter system messages if needed to guide AI behavior
5. Start chatting - responses stream in real-time with Markdown formatting
6. Use the draggable splitter to resize the conversation panes

## Development

### Build Process

The build process includes:
- Environment variable injection via `scripts/generate-env.js`
- Node modules copying for frontend dependencies
- TypeScript compilation for both backend and frontend

### Scripts

```bash
npm run build              # Full build (backend + frontend)
npm run build:backend      # Build backend only
npm run build:frontend     # Build frontend only
npm run dev               # Development mode (both servers)
npm run dev:backend       # Backend development server
npm run dev:frontend      # Frontend development server
npm start                 # Production start (backend only)
npm run start:frontend    # Production start (frontend only)
```

## Security Features

- **CORS Configuration**: Configurable origins with production warnings
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Security Headers**: Helmet.js integration
- **Input Sanitization**: XSS and injection protection
- **Request Size Limits**: 10MB limit on request bodies
- **Authentication**: JWT-based with Supabase

## Technologies Used

### Backend
- Node.js with Express
- TypeScript
- Supabase for authentication
- Ollama API integration
- Winston logging
- Joi validation

### Frontend
- Vanilla JavaScript (ES6+)
- HTML5/CSS3 with responsive design
- Marked.js for Markdown rendering
- Supabase client for authentication
- Environment variable injection

### Development
- TypeScript compilation
- Concurrent server management
- Environment configuration
- Security middleware

## Deployment

### Render.com Deployment

1. Create two services: one for backend, one for frontend
2. Set appropriate environment variables for each service
3. Configure `BACKEND_URL` in frontend service to point to backend service
4. Add CORS origins to environment variables

### Docker Deployment

The project can be containerized with separate containers for backend and frontend, allowing for independent scaling and deployment.

## API Endpoints

### Authentication
- `POST /auth/signup` - User registration
- `POST /auth/signin` - User login
- `POST /auth/signout` - User logout
- `GET /auth/user` - Get current user
- `GET /auth/github` - GitHub OAuth configuration

### Chat
- `GET /models` - List available Ollama models
- `POST /chat` - Chat with streaming responses

### Health
- `GET /health` - Basic health check endpoint
- `GET /health/ready` - Readiness check (includes Ollama connectivity)
- `GET /health/live` - Liveness check for Kubernetes
- `GET /health/metrics` - System metrics endpoint

### Health Check Endpoints

The application provides comprehensive health check endpoints accessible from both backend and frontend:

**Backend Server (port 5000):**
- `GET http://localhost:5000/health` - Basic health status
- `GET http://localhost:5000/health/ready` - Readiness check with Ollama connectivity
- `GET http://localhost:5000/health/live` - Liveness check for Kubernetes deployments
- `GET http://localhost:5000/health/metrics` - System resource metrics

**Frontend Server (port 3000):**
- `GET http://localhost:3000/health` - Proxied health check
- `GET http://localhost:3000/health/ready` - Proxied readiness check
- `GET http://localhost:3000/health/live` - Proxied liveness check
- `GET http://localhost:3000/health/metrics` - Proxied metrics endpoint

All health endpoints include proper CORS headers and are accessible from frontend applications for monitoring and health checks.

## Troubleshooting

### Common Issues

1. **BACKEND_URL not configured**: Ensure `BACKEND_URL` is set in environment variables
2. **CORS errors**: Configure `CORS_ORIGIN` appropriately for your deployment
3. **Supabase authentication**: Verify Supabase project settings and API keys
4. **Ollama connection**: Ensure Ollama server is accessible from backend

### Logs

Check the logs directory for application logs:
- Backend logs: `logs/app.log`
- Frontend logs: Browser console

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
