/**
 * Authentication and User Management Middleware
 * Enhanced with production security features
 */

const mongoManager = require('../../database/mongodb');
const { getEnvironmentConfig } = require('../config/production');

const config = getEnvironmentConfig();

/**
 * Extract user from Spotify token or session
 */
async function extractUser(req, res, next) {
  try {
    let userId = null;
    let userProfile = null;

    // Check for Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // For now, treat token as user ID (in production, validate JWT)
      userId = token;
    }

    // Check for user_id in request body
    if (!userId && req.body.user_id) {
      userId = req.body.user_id;
    }

    // Check for session-based user
    if (!userId && req.session?.user_id) {
      userId = req.session.user_id;
    }

    if (userId) {
      // Load user profile from database
      const db = mongoManager.getDb();
      const userProfilesCollection = db.collection('user_profiles');
      userProfile = await userProfilesCollection.findOne({ spotify_id: userId });

      if (!userProfile && userId) {
        // Create minimal user profile if not exists
        userProfile = {
          spotify_id: userId,
          display_name: 'Unknown User',
          created_at: new Date(),
          preferences: {},
          last_seen: new Date(),
          ip_address: getClientIP(req),
        };
        
        await userProfilesCollection.insertOne(userProfile);
      } else if (userProfile) {
        // Update last seen
        await userProfilesCollection.updateOne(
          { spotify_id: userId },
          { 
            $set: { 
              last_seen: new Date(),
              ip_address: getClientIP(req),
            }
          }
        );
      }
    }

    req.user = userProfile;
    req.userId = userId;
    next();
  } catch (error) {
    console.error('Error in extractUser middleware:', error);
    next();
  }
}

/**
 * Get client IP address with proxy support
 */
function getClientIP(req) {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
}

/**
 * Require authentication
 */
function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid user token or ID'
    });
  }
  next();
}

/**
 * Enhanced rate limiting middleware with multiple strategies
 */
function createRateLimit(options = {}) {
  const {
    windowMs = config.security.rateLimit.windowMs,
    max = config.security.rateLimit.max,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => getClientIP(req),
    skip = () => false,
    onLimitReached = null,
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    
    // Clean old entries
    for (const [k, data] of requests.entries()) {
      if (now - data.firstRequest > windowMs) {
        requests.delete(k);
      }
    }

    const userRequests = requests.get(key);
    if (!userRequests) {
      requests.set(key, { count: 1, firstRequest: now });
      next();
    } else if (userRequests.count < max) {
      userRequests.count++;
      next();
    } else {
      // Log rate limit violation
      console.warn(`Rate limit exceeded for ${key} on ${req.method} ${req.path}`);
      
      if (onLimitReached) {
        onLimitReached(req, res);
      }

      res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil((userRequests.firstRequest + windowMs - now) / 1000)
      });
    }
  };
}

/**
 * Smart rate limiting for authentication endpoints
 */
function createAuthRateLimit() {
  return createRateLimit({
    windowMs: config.security.authRateLimit.windowMs,
    max: config.security.authRateLimit.max,
    message: 'Too many authentication attempts, please try again later',
    keyGenerator: (req) => `auth:${getClientIP(req)}`,
    onLimitReached: (req) => {
      // Log potential brute force attempt
      console.warn(`Potential brute force attempt from ${getClientIP(req)}`);
    },
  });
}

/**
 * Enhanced error handling middleware with security considerations
 */
function errorHandler(err, req, res, _next) {
  // Future enhancement: implement structured error logging
  // eslint-disable-next-line no-unused-vars
  const nextFn = _next;
  
  // Log error with context
  const errorContext = {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: getClientIP(req),
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  };
  
  console.error('API Error:', errorContext);

  // Security: Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: isProduction ? undefined : err.errors
    });
  }

  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(500).json({
      error: 'Database Error',
      message: isProduction ? 'A database error occurred' : err.message
    });
  }

  if (err.status) {
    return res.status(err.status).json({
      error: err.message || 'An error occurred',
      ...(isProduction ? {} : { stack: err.stack })
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: isProduction 
      ? 'An unexpected error occurred' 
      : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
}

/**
 * Enhanced request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: getClientIP(req),
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    };
    
    // Color code status for console output
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : 
                       res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    const resetColor = '\x1b[0m';
    
    console.log(
      `${logData.method} ${logData.url} ${statusColor}${logData.status}${resetColor} ${logData.duration} - ${logData.ip}`
    );
  });
  
  next();
}

/**
 * Enhanced CORS middleware with dynamic origins and security headers
 */
function corsMiddleware(req, res, next) {
  const allowedOrigins = config.security.cors.origins;
  const origin = req.headers.origin;

  // Check if origin is allowed
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}

/**
 * Input validation and sanitization middleware
 */
function validateInput(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
        details: process.env.NODE_ENV === 'production' ? undefined : error.details
      });
    }
    next();
  };
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
 * Enhanced database connection middleware with health checks
 */
async function ensureDatabase(req, res, next) {
  try {
    if (!mongoManager.isConnected) {
      await mongoManager.connect();
    }
    
    // Periodic health check
    const now = Date.now();
    const lastCheck = ensureDatabase.lastHealthCheck || 0;
    
    if (now - lastCheck > 30000) { // Check every 30 seconds
      const health = await mongoManager.healthCheck();
      if (health.status !== 'healthy') {
        console.warn('Database health check failed:', health);
      }
      ensureDatabase.lastHealthCheck = now;
    }
    
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Database connection failed'
    });
  }
}

/**
 * Security headers middleware using helmet-like approach
 */
function securityHeaders(req, res, next) {
  // Content Security Policy
  const csp = config.security.helmet.contentSecurityPolicy;
  if (csp) {
    const cspHeader = Object.entries(csp.directives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');
    res.setHeader('Content-Security-Policy', cspHeader);
  }

  // HSTS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    const hsts = config.security.helmet.hsts;
    let hstsHeader = `max-age=${hsts.maxAge}`;
    if (hsts.includeSubDomains) hstsHeader += '; includeSubDomains';
    if (hsts.preload) hstsHeader += '; preload';
    res.setHeader('Strict-Transport-Security', hstsHeader);
  }

  next();
}

/**
 * Request size limiting middleware
 */
function requestSizeLimit(req, res, next) {
  const maxSize = parseInt(config.server.maxRequestSize) || 10485760; // 10MB default
  
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Request size exceeds ${maxSize} bytes`
    });
  }
  
  next();
}

module.exports = {
  extractUser,
  requireAuth,
  createRateLimit,
  createAuthRateLimit,
  errorHandler,
  requestLogger,
  corsMiddleware,
  validateInput,
  sanitizeInput,
  ensureDatabase,
  securityHeaders,
  requestSizeLimit,
  getClientIP,
};