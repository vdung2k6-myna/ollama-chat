import { config } from '../config';
import { logger } from './logger';

/**
 * Validates environment configuration and logs warnings for potential security issues
 */
export function validateEnvironment() {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for production security issues
  if (config.server.nodeEnv === 'production') {
    // Check CORS configuration
    if (!config.security.corsOrigin || config.security.corsOrigin === '*') {
      warnings.push('CORS origin is set to "*" in production. This is not recommended.');
    }

    // Check for development logging level
    if (config.logging.level === 'debug') {
      warnings.push('Debug logging is enabled in production. This may expose sensitive information.');
    }

    // Check for default ports
    if (config.server.port === 3000) {
      warnings.push('Using default port 3000 in production. Consider using a different port.');
    }

    if (config.frontend.port === 3001) {
      warnings.push('Using default frontend port 3001 in production. Consider using a different port.');
    }
  }

  // Check for development mode warnings
  if (config.server.nodeEnv === 'development') {
    if (config.security.corsOrigin !== '*') {
      logger.info('CORS origin is restricted in development mode. Make sure this is intentional.');
    }
  }

  // Check rate limiting configuration
  if (config.security.rateLimit.max > 1000) {
    warnings.push(`Rate limit is set to ${config.security.rateLimit.max} requests per ${config.security.rateLimit.windowMs}ms. This may be too high for production.`);
  }

  if (config.security.rateLimit.windowMs < 60000) {
    warnings.push(`Rate limit window is set to ${config.security.rateLimit.windowMs}ms. This may be too short.`);
  }

  // Check logging configuration
  if (config.logging.level === 'debug' && config.server.nodeEnv === 'production') {
    errors.push('Debug logging is enabled in production. This is a security risk.');
  }

  // Log results
  if (warnings.length > 0) {
    logger.warn('Environment configuration warnings:', warnings);
  }

  if (errors.length > 0) {
    logger.error('Environment configuration errors:', errors);
    if (config.server.nodeEnv === 'production') {
      logger.error('Please fix these issues before deploying to production.');
    }
  }

  // Log current configuration (sanitized)
  logger.info('Environment validation completed', {
    environment: config.server.nodeEnv,
    port: config.server.port,
    frontendPort: config.frontend.port,
    corsOrigin: config.security.corsOrigin === '*' ? 'wildcard' : 'restricted',
    rateLimit: `${config.security.rateLimit.max} requests per ${config.security.rateLimit.windowMs}ms`,
    logLevel: config.logging.level
  });

  return {
    warnings,
    errors,
    isValid: errors.length === 0
  };
}

/**
 * Validates that required environment variables are set
 */
export function validateRequiredEnvVars() {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', missingVars);
    logger.error('Please set these variables in your .env file');
    
    if (config.server.nodeEnv === 'production') {
      process.exit(1);
    }
    
    return false;
  }

  logger.info('All required environment variables are set');
  return true;
}

export default {
  validateEnvironment,
  validateRequiredEnvVars
};