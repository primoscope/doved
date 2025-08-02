/**
 * API Middleware for EchoTune AI
 * Authentication, rate limiting, CORS, and other middleware functions
 */

const cors = require('cors');

/**
 * Simple authentication middleware
 * For development, accepts any bearer token or user ID
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'Authorization required',
      message: 'Please provide an authorization header'
    });
  }

  // Extract token/user ID from Authorization header
  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      error: 'Invalid authorization format',
      message: 'Authorization header must be in format: Bearer <token>'
    });
  }

  // For development, accept any non-empty token
  req.userId = token;
  next();
}

/**
 * Extract user information from request (optional)
 */
function extractUser(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    req.userId = token;
  }
  
  next();
}

/**
 * Create rate limiter with custom options
 * Simple in-memory rate limiting for development
 */
function createRateLimit(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
  const max = options.max || 100; // limit each IP to 100 requests per windowMs
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean old entries
    const cutoff = now - windowMs;
    for (const [k, v] of requests.entries()) {
      if (v.resetTime < cutoff) {
        requests.delete(k);
      }
    }
    
    // Check current request count
    const requestInfo = requests.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (requestInfo.count >= max) {
      return res.status(429).json({
        error: 'Too many requests',
        message: options.message || 'Too many requests, please try again later.',
        retryAfter: Math.ceil((requestInfo.resetTime - now) / 1000)
      });
    }
    
    // Update request count
    requestInfo.count++;
    requests.set(key, requestInfo);
    
    next();
  };
}

/**
 * Database connection middleware
 */
function ensureDatabase(req, res, next) {
  // Database connection is handled at startup
  // This middleware can be used for per-request database checks if needed
  next();
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path}`);
  
  // Track response time
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  
  next();
}

/**
 * CORS middleware
 */
const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow production domains
    const allowedDomains = [
      'https://primosphere.studio',
      'https://www.primosphere.studio'
    ];
    
    if (allowedDomains.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, _next) {
  console.error('Error:', err);
  
  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized access';
  } else if (err.message) {
    message = err.message;
  }
  
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  const csp = 'default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://api.spotify.com; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https://i.scdn.co; connect-src \'self\' https://api.spotify.com https://accounts.spotify.com; media-src \'self\' https://p.scdn.co; frame-src https://open.spotify.com';
  res.setHeader('Content-Security-Policy', csp);
  
  next();
}

/**
 * Input sanitization middleware
 */
function sanitizeInput(req, res, next) {
  // Basic XSS protection for text inputs
  function sanitizeValue(value) {
    if (typeof value === 'string') {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    return value;
  }

  function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return sanitizeValue(obj);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        sanitized[key] = value.map(sanitizeObject);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = sanitizeValue(value);
      }
    }
    return sanitized;
  }

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
}

/**
 * Request size limiting middleware
 */
function requestSizeLimit(req, res, next) {
  const maxSize = 10485760; // 10MB default
  
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Request size exceeds ${maxSize} bytes`
    });
  }
  
  next();
}

module.exports = {
  requireAuth,
  extractUser,
  createRateLimit,
  ensureDatabase,
  requestLogger,
  corsMiddleware,
  errorHandler,
  securityHeaders,
  sanitizeInput,
  requestSizeLimit
};