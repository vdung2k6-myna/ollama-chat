import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'sha256-yLjcYmkye2I7Mw6V89twnodV94/+wzw3GgYPLadC4cE='"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        config.ollama.baseUrl,
        "http://localhost:8000", // Allow connections to localhost:8000 for GitHub OAuth
        "https://myna.ddns.net:8080", // Keep existing allowed domain
        "https://github.com", // Allow GitHub OAuth redirects
        "https://*.github.com", // Allow GitHub subdomains
        "https://supabase.co", // Allow Supabase connections
        "https://*.supabase.co", // Allow Supabase subdomains
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"]
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: any) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Development mode - allow all origins
    if (config.server.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // Production mode - strict origin checking
    const allowedOrigins = [
      // Load balancer IP ranges (to be configured per environment)
      ...getLoadBalancerOrigins(),
      
      // Frontend server
      `${config.frontend.host}:${config.frontend.port}`,
      
      // Supabase and GitHub for OAuth
      'https://supabase.co',
      'https://*.supabase.co',
      'https://github.com',
      'https://*.github.com'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-Forwarded-For',
    'X-Real-IP'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Response-Time'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

function getLoadBalancerOrigins(): string[] {
  // Load from environment variables
  const lbOrigins = process.env['LOAD_BALANCER_ORIGINS'];
  if (lbOrigins) {
    return lbOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default load balancer IP ranges for major cloud providers
  return [
    // AWS ALB ranges (these should be updated regularly)
    '10.0.0.0/8', // Private networks
    '172.16.0.0/12', // Private networks
    '192.168.0.0/16', // Private networks
    
    // Add specific cloud provider health check ranges as needed
  ];
}

export const corsMiddleware = cors(corsOptions);

// Rate limiting
export const rateLimitMiddleware = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method
    });
    
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later.'
      }
    });
  }
});

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    
    logger[logLevel]('HTTP Request:', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length')
    });
  });
  
  next();
}

// Request size limit middleware
export function requestSizeLimit(req: Request, res: Response, next: NextFunction): void {
  const contentLength = parseInt(req.get('content-length') || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB limit
  
  if (contentLength > maxSize) {
    logger.warn('Request size too large:', {
      size: contentLength,
      limit: maxSize,
      ip: req.ip,
      url: req.url
    });
    
    res.status(413).json({
      success: false,
      error: {
        message: 'Request entity too large. Maximum size is 10MB.'
      }
    });
    return;
  }
  
  next();
}

// Sanitize request headers
export function sanitizeHeaders(req: Request, res: Response, next: NextFunction): void {
  // Remove potentially dangerous headers
  const dangerousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-cluster-client-ip',
    'x-originating-ip'
  ];
  
  dangerousHeaders.forEach(header => {
    if (req.headers[header]) {
      delete req.headers[header];
    }
  });
  
  next();
}

export default {
  securityHeaders,
  corsMiddleware,
  rateLimitMiddleware,
  requestLogger,
  requestSizeLimit,
  sanitizeHeaders
};