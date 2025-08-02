/**
 * Production Configuration and Security Settings
 * Enhanced configuration for production deployment
 */

const path = require('path');

// Production configuration object
const productionConfig = {
  // Server settings
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.NODE_ENV === 'production',
    compression: process.env.COMPRESSION !== 'false',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  },

  // Security settings
  security: {
    // CORS configuration
    cors: {
      origins: process.env.CORS_ORIGINS ? 
        process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : 
        ['https://primosphere.studio', 'https://www.primosphere.studio'],
      credentials: true,
      optionsSuccessStatus: 200,
    },

    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      standardHeaders: true,
      legacyHeaders: false,
      trustProxy: process.env.NODE_ENV === 'production',
    },

    // Auth-specific rate limiting
    authRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
      skipSuccessfulRequests: true,
      trustProxy: process.env.NODE_ENV === 'production',
    },

    // Helmet security headers
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ['\'self\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
          fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
          scriptSrc: ['\'self\'', '\'unsafe-inline\'', 'https://apis.google.com'],
          connectSrc: ['\'self\'', 'https://api.spotify.com', 'wss://api.spotify.com'],
          imgSrc: ['\'self\'', 'data:', 'https:', 'http:'],
          objectSrc: ['\'none\''],
          baseUri: ['\'self\''],
          formAction: ['\'self\''],
          frameAncestors: ['\'none\''],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    },

    // Session configuration
    session: {
      secret: process.env.SESSION_SECRET || generateSecureSecret(),
      resave: false,
      saveUninitialized: false,
      name: 'echotune.sid',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax',
      },
    },
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
    file: process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'app.log'),
    accessLog: process.env.ACCESS_LOG_FILE || path.join(process.cwd(), 'logs', 'access.log'),
    errorLog: path.join(process.cwd(), 'logs', 'error.log'),
    maxSize: '20m',
    maxFiles: '14d',
  },

  // Database configuration
  database: {
    mongodb: {
      uri: process.env.MONGODB_URI,
      database: process.env.MONGODB_DATABASE || 'echotune_production',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        retryWrites: true,
        w: 'majority',
      },
    },
    redis: {
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'echotune:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    },
  },

  // Caching configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1 hour
    spotifyApiTtl: parseInt(process.env.SPOTIFY_API_CACHE_TTL) || 300, // 5 minutes
    enabled: process.env.NODE_ENV === 'production',
  },

  // Performance settings
  performance: {
    clustering: process.env.CLUSTERING === 'true',
    workers: process.env.WORKERS || require('os').cpus().length,
    keepAliveTimeout: 65000,
    headersTimeout: 66000,
  },

  // Features flags
  features: {
    recommendations: process.env.ENABLE_RECOMMENDATIONS !== 'false',
    playlistCreation: process.env.ENABLE_PLAYLIST_CREATION !== 'false',
    userAnalytics: process.env.ENABLE_USER_ANALYTICS !== 'false',
    chatHistory: process.env.ENABLE_CHAT_HISTORY !== 'false',
  },

  // Monitoring and health checks
  monitoring: {
    healthCheck: {
      timeout: 5000,
      interval: 30000,
    },
    metrics: {
      enabled: process.env.NODE_ENV === 'production',
      endpoint: '/metrics',
    },
  },

  // Backup configuration
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
    retention: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    destination: path.join(process.cwd(), 'backups'),
  },
};

/**
 * Generate a secure secret if not provided
 */
function generateSecureSecret() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be provided in production');
  }
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate production configuration
 */
function validateProductionConfig() {
  const errors = [];

  if (process.env.NODE_ENV === 'production') {
    // Required environment variables for production
    const required = [
      'SPOTIFY_CLIENT_ID',
      'SPOTIFY_CLIENT_SECRET',
      'SESSION_SECRET',
      'FRONTEND_URL',
    ];

    for (const variable of required) {
      if (!process.env[variable]) {
        errors.push(`Missing required environment variable: ${variable}`);
      }
    }

    // Validate session secret length
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters long');
    }

    // Validate URLs
    if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.startsWith('https://')) {
      errors.push('FRONTEND_URL must use HTTPS in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n${errors.join('\n')}`);
  }

  return true;
}

/**
 * Get environment-specific configuration
 */
function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  const envConfigs = {
    development: {
      ...productionConfig,
      security: {
        ...productionConfig.security,
        cors: {
          ...productionConfig.security.cors,
          origins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        },
        session: {
          ...productionConfig.security.session,
          cookie: {
            ...productionConfig.security.session.cookie,
            secure: false,
          },
        },
      },
      logging: {
        ...productionConfig.logging,
        level: 'debug',
        format: 'dev',
      },
    },
    test: {
      ...productionConfig,
      database: {
        ...productionConfig.database,
        mongodb: {
          ...productionConfig.database.mongodb,
          database: 'echotune_test',
        },
      },
      logging: {
        ...productionConfig.logging,
        level: 'error',
      },
    },
    production: productionConfig,
  };

  return envConfigs[env] || envConfigs.development;
}

module.exports = {
  productionConfig,
  validateProductionConfig,
  getEnvironmentConfig,
};