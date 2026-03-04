import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Validation result handler
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    throw new AppError(`Validation failed: ${errorMessages.join(', ')}`, 400);
  }
  
  next();
};

// Ollama API validation rules
export const validateOllamaRequest = [
  body('model')
    .isString()
    .notEmpty()
    .withMessage('Model name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name must be between 1 and 100 characters'),
  
  body('prompt')
    .isString()
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ max: 10000 })
    .withMessage('Prompt cannot exceed 10,000 characters'),
  
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean'),
  
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object'),
  
  body('options.temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  
  body('options.top_p')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Top_p must be between 0 and 1'),
  
  body('options.top_k')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Top_k must be between 1 and 100'),
  
  validate
];

// Chat message validation
export const validateChatMessage = [
  body('messages')
    .isArray({ min: 1 })
    .withMessage('Messages array is required and must not be empty'),
  
  body('messages.*.role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Role must be one of: user, assistant, system'),
  
  body('messages.*.content')
    .isString()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 5000 })
    .withMessage('Message content cannot exceed 5,000 characters'),
  
  body('model')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name must be between 1 and 100 characters'),
  
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean'),
  
  validate
];

// Model name validation for params
export const validateModelName = [
  param('model')
    .isString()
    .notEmpty()
    .withMessage('Model name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name must be between 1 and 100 characters'),
  
  validate
];

// Query parameter validation
export const validateQueryParams = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  
  validate
];

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize string inputs
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove potentially dangerous characters
        req.body[key] = req.body[key]
          .replace(/[<>]/g, '') // Remove HTML tags
          .trim();
      }
    });
  }
  
  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/[<>]/g, '')
          .trim();
      }
    });
  }
  
  next();
};

export default {
  validate,
  validateOllamaRequest,
  validateChatMessage,
  validateModelName,
  validateQueryParams,
  sanitizeInput
};