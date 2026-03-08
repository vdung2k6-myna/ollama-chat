import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server configuration
  HTTP_LOCAL_PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  
  // Ollama configuration
  OLLAMA_API_URL: Joi.string().uri().required(),
  
  // Frontend configuration
  FRONTEND_PORT: Joi.number().default(3001),
  FRONTEND_HOST: Joi.string().default('localhost'),
  
  // Security configuration
  CORS_ORIGIN: Joi.string().default('*'),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Health check configuration
  HEALTH_CHECK_TIMEOUT: Joi.number().default(5000),
  HEALTH_CHECK_CACHE_DURATION: Joi.number().default(30000),
  CIRCUIT_BREAKER_THRESHOLD: Joi.number().default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT: Joi.number().default(60000),
  
  // Load balancer configuration
  LOAD_BALANCER_ORIGINS: Joi.string().optional().allow(''),
  
  // Logging configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().default('logs/app.log'),
  
  // API Keys (optional for future use)
  OPENAI_API_KEY: Joi.string().optional().allow(''),
  ANTHROPIC_API_KEY: Joi.string().optional().allow('')
}).unknown();

// Validate environment configuration
const { error, value: envConfig } = configSchema.validate(process.env);

if (error) {
  console.error('Configuration validation error:', error.details?.[0]?.message || 'Unknown validation error');
  process.exit(1);
}

// Parse OLLAMA_API_URL to extract protocol, host, and port
function parseOllamaUrl(url: string) {
  try {
    const urlObj = new URL(url);
    return {
      protocol: urlObj.protocol.replace(':', ''),
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80),
      baseUrl: url
    };
  } catch (error) {
    console.error('Invalid OLLAMA_API_URL format:', url);
    process.exit(1);
  }
}

const ollamaConfig = parseOllamaUrl(envConfig.OLLAMA_API_URL);

// Build configuration object
export const config = {
  // Server
  server: {
    port: envConfig.HTTP_LOCAL_PORT,
    nodeEnv: envConfig.NODE_ENV,
    host: envConfig.HTTP_LOCAL_HOST
  },
  
  // Ollama
  ollama: ollamaConfig,
  
  // Frontend
  frontend: {
    port: envConfig.FRONTEND_PORT,
    host: envConfig.FRONTEND_HOST
  },
  
  // Security
  security: {
    corsOrigin: envConfig.CORS_ORIGIN,
    rateLimit: {
      windowMs: envConfig.RATE_LIMIT_WINDOW_MS,
      max: envConfig.RATE_LIMIT_MAX_REQUESTS
    }
  },
  
  // Health check settings
  healthCheck: {
    timeout: envConfig.HEALTH_CHECK_TIMEOUT,
    cacheDuration: envConfig.HEALTH_CHECK_CACHE_DURATION,
    circuitBreaker: {
      threshold: envConfig.CIRCUIT_BREAKER_THRESHOLD,
      resetTimeout: envConfig.CIRCUIT_BREAKER_RESET_TIMEOUT
    }
  },
  
  // CORS settings
  cors: {
    origins: envConfig.LOAD_BALANCER_ORIGINS ? 
      envConfig.LOAD_BALANCER_ORIGINS.split(',') : 
      []
  },
  
  // Logging
  logging: {
    level: envConfig.LOG_LEVEL,
    file: envConfig.LOG_FILE
  },
  
  // API Keys
  apiKeys: {
    openai: envConfig.OPENAI_API_KEY,
    anthropic: envConfig.ANTHROPIC_API_KEY
  }
};

// Validate required configuration
if (config.server.nodeEnv === 'production') {
  if (!config.security.corsOrigin || config.security.corsOrigin === '*') {
    console.warn('WARNING: CORS origin is set to "*" in production. This is not recommended.');
  }
}

export default config;