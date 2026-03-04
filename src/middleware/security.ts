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
  origin: true, // Allow all origins for now to fix TypeScript issue
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count']
};

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