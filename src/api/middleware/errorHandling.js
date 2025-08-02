/**
 * Phase 3 Enhanced Error Handling Middleware
 * Implements timeout management, retry logic, and graceful degradation
 */

const _path = require('path');

/**
 * Timeout middleware with user feedback
 */
const timeoutMiddleware = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          message: 'The request took too long to process. Please try again.',
          timeout: timeoutMs,
          timestamp: new Date().toISOString(),
          requestId: req.id || Math.random().toString(36).substr(2, 9)
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

/**
 * Retry logic utility
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Retry attempt ${attempt} failed, waiting ${delay}ms before retry...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * API Error Class
 */
class APIError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('🚨 Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details = {};

  // Handle different error types
  if (err instanceof APIError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Invalid input data';
    details = err.details || err.errors;
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    statusCode = 503;
    errorCode = 'DATABASE_ERROR';
    message = 'Database connection error';
    details = { type: 'mongodb' };
  } else if (err.code === 'SQLITE_ERROR') {
    statusCode = 503;
    errorCode = 'DATABASE_ERROR';
    message = 'Database error';
    details = { type: 'sqlite' };
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_ENTRY';
    message = 'Duplicate entry found';
  } else if (err.message?.includes('timeout')) {
    statusCode = 408;
    errorCode = 'TIMEOUT_ERROR';
    message = 'Request timeout';
  } else if (err.message?.includes('401') || err.message?.includes('unauthorized')) {
    statusCode = 401;
    errorCode = 'AUTHENTICATION_ERROR';
    message = 'Authentication failed';
  } else if (err.message?.includes('403') || err.message?.includes('forbidden')) {
    statusCode = 403;
    errorCode = 'AUTHORIZATION_ERROR';
    message = 'Access forbidden';
  } else if (err.message?.includes('429') || err.message?.includes('rate limit')) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_ERROR';
    message = 'Rate limit exceeded';
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
    details = {};
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: errorCode,
    message,
    details,
    timestamp: new Date().toISOString(),
    requestId: req.id || Math.random().toString(36).substr(2, 9),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString(),
    requestId: req.id || Math.random().toString(36).substr(2, 9)
  });
};

/**
 * Async wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation middleware
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      
      if (error) {
        const details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        
        throw new APIError('Validation failed', 400, 'VALIDATION_ERROR', details);
      }
      
      req.validatedData = value;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Rate limiting middleware
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => req.ip,
    _skipSuccessfulRequests = false,
    _skipFailedRequests = false
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(key)) {
      const userRequests = requests.get(key).filter(time => time > windowStart);
      requests.set(key, userRequests);
    } else {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);

    if (userRequests.length >= max) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfter: Math.ceil(windowMs / 1000),
        limit: max,
        windowMs,
        timestamp: new Date().toISOString()
      });
    }

    // Add current request
    userRequests.push(now);

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - userRequests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });

    next();
  };
};

/**
 * Health check middleware
 */
const healthCheck = (dependencies = {}) => {
  return async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dependencies: {}
    };

    // Check dependencies
    for (const [name, checkFn] of Object.entries(dependencies)) {
      try {
        const result = await checkFn();
        health.dependencies[name] = {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        health.dependencies[name] = {
          status: 'unhealthy',
          error: error.message
        };
        health.status = 'degraded';
      }
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  };
};

/**
 * Graceful degradation wrapper
 */
const gracefulDegrade = (primaryFn, fallbackFn, options = {}) => {
  const { timeout = 5000, retries = 1 } = options;
  
  return async (...args) => {
    try {
      // Try primary function with timeout
      const result = await Promise.race([
        retryWithBackoff(primaryFn.bind(null, ...args), retries),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Primary function timeout')), timeout)
        )
      ]);
      
      return result;
    } catch (error) {
      console.warn('Primary function failed, using fallback:', error.message);
      
      try {
        return await fallbackFn(...args);
      } catch (fallbackError) {
        console.error('Fallback function also failed:', fallbackError.message);
        throw new APIError(
          'Service temporarily unavailable',
          503,
          'SERVICE_DEGRADED',
          {
            primaryError: error.message,
            fallbackError: fallbackError.message
          }
        );
      }
    }
  };
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Generate request ID
  req.id = Math.random().toString(36).substr(2, 9);
  
  // Log request
  console.log(`📝 ${req.method} ${req.url} [${req.id}] - ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? '🚨' : '✅';
    console.log(`${level} ${req.method} ${req.url} [${req.id}] - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
};

/**
 * CORS middleware with enhanced options
 */
const corsHandler = (options = {}) => {
  const {
    origin = process.env.FRONTEND_URL || 'http://localhost:3000',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials = true
  } = options;

  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', methods.join(', '));
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.header('Access-Control-Allow-Credentials', credentials);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  };
};

module.exports = {
  timeoutMiddleware,
  retryWithBackoff,
  APIError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequest,
  rateLimiter,
  healthCheck,
  gracefulDegrade,
  requestLogger,
  corsHandler
};