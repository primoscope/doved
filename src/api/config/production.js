/**
 * Production Configuration
 * Environment-specific settings for production deployment
 */

const path = require('path');

const defaultConfig = {
  app: {
    name: 'EchoTune AI',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
  },

  database: {
    mongodb: {
      uri: process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017/echotune',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
        serverSelectionTimeoutMS: parseInt(process.env.DB_TIMEOUT) || 5000
      }
    },
    supabase: {
      url: process.env.SUPABASE_URL || '',
      key: process.env.SUPABASE_ANON_KEY || '',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    },
    sqlite: {
      path: process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'echotune.sqlite'),
      options: {
        enableWAL: process.env.SQLITE_WAL !== 'false',
        busyTimeout: parseInt(process.env.SQLITE_TIMEOUT) || 5000
      }
    }
  },

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/callback',
    scopes: [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'user-read-recently-played',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-top-read',
      'user-library-read',
      'user-library-modify'
    ]
  },

  llm: {
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-pro',
        maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 2000
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo',
        baseUrl: 'https://openrouter.ai/api/v1'
      }
    },
    defaultProvider: process.env.LLM_PROVIDER || 'mock',
    fallbackProvider: process.env.LLM_FALLBACK_PROVIDER || 'mock',
    timeout: parseInt(process.env.LLM_TIMEOUT) || 30000
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'development-session-secret',
    encryptionKey: process.env.ENCRYPTION_KEY || 'development-encryption-key',
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
    trustProxy: process.env.TRUST_PROXY === 'true',
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false
    }
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || null,
    enableConsole: process.env.LOG_CONSOLE !== 'false'
  },

  cache: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB) || 0
    },
    ttl: {
      default: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
      spotify: parseInt(process.env.CACHE_TTL_SPOTIFY) || 600, // 10 minutes
      llm: parseInt(process.env.CACHE_TTL_LLM) || 3600, // 1 hour
      recommendations: parseInt(process.env.CACHE_TTL_RECOMMENDATIONS) || 1800 // 30 minutes
    }
  },

  features: {
    enableSpotify: process.env.ENABLE_SPOTIFY !== 'false',
    enableLLM: process.env.ENABLE_LLM !== 'false',
    enableVoice: process.env.ENABLE_VOICE === 'true',
    enableAnalytics: process.env.ENABLE_ANALYTICS !== 'false',
    enableCaching: process.env.ENABLE_CACHING !== 'false',
    enableMetrics: process.env.ENABLE_METRICS !== 'false'
  }
};

/**
 * Get environment-specific configuration
 */
function getEnvironmentConfig(env = process.env.NODE_ENV) {
  const config = { ...defaultConfig };

  switch (env) {
    case 'production':
      config.app.environment = 'production';
      config.logging.level = 'warn';
      config.features.enableMetrics = true;
      break;

    case 'test':
      config.app.environment = 'test';
      config.app.port = 0; // Use random port for tests
      config.logging.level = 'error';
      config.features.enableAnalytics = false;
      config.features.enableMetrics = false;
      break;

    case 'development':
    default:
      config.app.environment = 'development';
      config.logging.level = 'debug';
      config.features.enableMetrics = false;
      break;
  }

  return config;
}

/**
 * Validate required configuration
 */
function validateConfig(config) {
  const errors = [];

  // Check required environment variables in production
  if (config.app.environment === 'production') {
    if (!config.spotify.clientId) {
      errors.push('SPOTIFY_CLIENT_ID is required in production');
    }
    if (!config.spotify.clientSecret) {
      errors.push('SPOTIFY_CLIENT_SECRET is required in production');
    }
    if (config.security.jwtSecret === 'development-secret-change-in-production') {
      errors.push('JWT_SECRET must be changed in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

module.exports = {
  getEnvironmentConfig,
  validateConfig,
  defaultConfig
};