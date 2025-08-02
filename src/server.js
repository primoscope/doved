const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const compression = require('compression');

// Load environment variables
dotenv.config();

// Import configuration and validation
const { validateProductionConfig, getEnvironmentConfig } = require('./config/production');

// Validate production configuration
try {
  validateProductionConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

const config = getEnvironmentConfig();

// Import API routes and middleware
const chatRoutes = require('./api/routes/chat');
const recommendationRoutes = require('./api/routes/recommendations');
const spotifyRoutes = require('./api/routes/spotify');
const providersRoutes = require('./api/routes/providers');
const databaseRoutes = require('./api/routes/database');
const playlistRoutes = require('./api/routes/playlists');
const { 
  extractUser, 
  ensureDatabase, 
  errorHandler, 
  requestLogger, 
  corsMiddleware,
  createRateLimit,
  securityHeaders,
  sanitizeInput,
  requestSizeLimit,
} = require('./api/middleware');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [`https://${process.env.DOMAIN || 'primosphere.studio'}`]
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});
const PORT = config.server.port;

// Trust proxy if in production (for proper IP detection behind reverse proxy)
if (config.server.trustProxy) {
  app.set('trust proxy', 1);
}

// Spotify OAuth configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Environment-aware redirect URI fallback
const getDefaultRedirectUri = () => {
    if (process.env.NODE_ENV === 'production') {
        return `https://${process.env.DOMAIN || 'primosphere.studio'}/auth/callback`;
    }
    return `http://localhost:${PORT}/auth/callback`;
};

const getDefaultFrontendUrl = () => {
    if (process.env.NODE_ENV === 'production') {
        return `https://${process.env.DOMAIN || 'primosphere.studio'}`;
    }
    return `http://localhost:${PORT}`;
};

const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || getDefaultRedirectUri();
const FRONTEND_URL = process.env.FRONTEND_URL || getDefaultFrontendUrl();

// Security and performance middleware
app.use(securityHeaders);

// Compression middleware
if (config.server.compression) {
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
  }));
}

// Global rate limiting
const globalRateLimit = createRateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  message: 'Too many requests from this IP, please try again later',
});
app.use(globalRateLimit);

// Request logging and monitoring
app.use(requestLogger);

// CORS with production configuration
app.use(corsMiddleware);

// Request size limiting
app.use(requestSizeLimit);

// Body parsing with size limits
app.use(express.json({ 
  limit: config.server.maxRequestSize,
  verify: (req, res, buf) => {
    // Additional payload verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: config.server.maxRequestSize 
}));

// Input sanitization
app.use(sanitizeInput);

// Static file serving with caching headers
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Serve React frontend files
app.use('/frontend', express.static(path.join(__dirname, 'frontend'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: false,
  setHeaders: (res) => {
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Serve src directory for JavaScript modules with no-cache in development
app.use('/src', express.static(path.join(__dirname), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: false,
  setHeaders: (res) => {
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Database connection middleware
app.use(ensureDatabase);

// User extraction middleware for all routes
app.use(extractUser);

// Store for temporary state (in production, use Redis or database)
const authStates = new Map();

// Utility functions
const generateRandomString = (length) => {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
};

const base64encode = (str) => {
    return Buffer.from(str).toString('base64');
};

// Routes

// Enhanced health check endpoints
const HealthCheckSystem = require('./utils/health-check');
const healthChecker = new HealthCheckSystem();

// Comprehensive health check endpoint
app.get('/health', async (req, res) => {
    try {
        const healthReport = await healthChecker.runAllChecks();
        
        // Set appropriate HTTP status based on health
        const statusCode = healthReport.status === 'healthy' ? 200 : 
                          healthReport.status === 'warning' ? 200 : 503;
        
        res.status(statusCode).json(healthReport);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Health check system failure',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Individual health check endpoints
app.get('/health/:check', async (req, res) => {
    try {
        const checkName = req.params.check;
        const result = await healthChecker.runCheck(checkName);
        
        const statusCode = result.status === 'healthy' ? 200 : 
                          result.status === 'warning' ? 200 : 503;
        
        res.status(statusCode).json({
            check: checkName,
            ...result
        });
    } catch (error) {
        res.status(400).json({
            error: 'Invalid health check',
            message: error.message,
            availableChecks: Array.from(healthChecker.checks.keys())
        });
    }
});

// Simple readiness probe (lightweight check for load balancers)
app.get('/ready', (req, res) => {
    res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Simple liveness probe (basic application response)
app.get('/alive', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid
    });
});

// Main page - Modern Interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/modern-index.html'));
});

// Legacy interface (for comparison)
app.get('/legacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Spotify authentication initiation
app.get('/auth/spotify', (req, res) => {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return res.status(500).json({
            error: 'Spotify credentials not configured',
            message: 'Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables'
        });
    }

    const state = generateRandomString(16);
    const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private user-read-recently-played user-top-read';
    
    // Store state for verification
    authStates.set(state, {
        timestamp: Date.now(),
        ip: req.ip
    });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    for (const [key, value] of authStates.entries()) {
        if (value.timestamp < tenMinutesAgo) {
            authStates.delete(key);
        }
    }

    const authURL = 'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: scope,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            state: state
        }).toString();

    res.redirect(authURL);
});

// Spotify OAuth callback
app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        console.error('Spotify auth error:', error);
        return res.redirect(`${FRONTEND_URL}?error=access_denied`);
    }

    if (!code || !state) {
        return res.redirect(`${FRONTEND_URL}?error=invalid_request`);
    }

    // Verify state
    const storedState = authStates.get(state);
    if (!storedState) {
        return res.redirect(`${FRONTEND_URL}?error=state_mismatch`);
    }

    // Remove used state
    authStates.delete(state);

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: SPOTIFY_REDIRECT_URI
            }),
            {
                headers: {
                    'Authorization': 'Basic ' + base64encode(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token } = tokenResponse.data;
        // Note: refresh_token and expires_in available for future token refresh implementation

        // Get user profile
        const userResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const userProfile = userResponse.data;

        // In a real application, store these tokens securely in a database
        // For now, we'll redirect with success and include basic user info
        const userInfo = {
            id: userProfile.id,
            display_name: userProfile.display_name,
            email: userProfile.email,
            country: userProfile.country,
            followers: userProfile.followers?.total || 0,
            premium: userProfile.product === 'premium'
        };

        // Redirect to frontend with success
        const encodedUserInfo = encodeURIComponent(JSON.stringify(userInfo));
        res.redirect(`${FRONTEND_URL}?auth=success&user=${encodedUserInfo}`);

    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error.message);
        res.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
    }
});

// API endpoint to get user's Spotify data (requires authentication in production)
app.post('/api/spotify/recommendations', async (req, res) => {
    try {
        const { access_token, seed_genres, limit = 20, target_features = {} } = req.body;

        if (!access_token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Build recommendations query
        const params = new URLSearchParams({
            limit: limit.toString(),
            seed_genres: (seed_genres || ['pop', 'rock']).join(',')
        });

        // Add target audio features if provided
        Object.entries(target_features).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.append(`target_${key}`, value.toString());
            }
        });

        const response = await axios.get(
            `https://api.spotify.com/v1/recommendations?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            }
        );

        res.json({
            recommendations: response.data.tracks,
            seed_genres: seed_genres,
            target_features: target_features,
            status: 'success'
        });

    } catch (error) {
        console.error('Recommendations error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to get recommendations',
            message: error.response?.data?.error?.message || error.message
        });
    }
});

// API endpoint to create playlist
app.post('/api/spotify/playlist', async (req, res) => {
    try {
        const { access_token, name, description, tracks, isPublic = false } = req.body;

        if (!access_token || !name || !tracks || !Array.isArray(tracks)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get user ID first
        const userResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        const userId = userResponse.data.id;

        // Create playlist
        const playlistResponse = await axios.post(
            `https://api.spotify.com/v1/users/${userId}/playlists`,
            {
                name: name,
                description: description || 'Created by EchoTune AI',
                public: isPublic
            },
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const playlist = playlistResponse.data;

        // Add tracks to playlist
        if (tracks.length > 0) {
            await axios.post(
                `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
                {
                    uris: tracks
                },
                {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        }

        res.json({
            playlist: {
                id: playlist.id,
                name: playlist.name,
                description: playlist.description,
                external_url: playlist.external_urls.spotify,
                tracks_added: tracks.length
            },
            status: 'success'
        });

    } catch (error) {
        console.error('Playlist creation error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to create playlist',
            message: error.response?.data?.error?.message || error.message
        });
    }
});

// Chatbot endpoint (basic implementation)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        // Note: user_context available for future personalization features

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Simple intent recognition (in production, use proper NLP)
        const lowerMessage = message.toLowerCase();
        let response = '';
        let action = null;

        if (lowerMessage.includes('recommend') || lowerMessage.includes('suggest')) {
            response = 'I\'d love to recommend some music for you! What mood are you in? Or what genre would you like to explore?';
            action = 'recommend';
        } else if (lowerMessage.includes('playlist')) {
            response = 'I can help you create a personalized playlist! What would you like to name it and what kind of vibe are you going for?';
            action = 'create_playlist';
        } else if (lowerMessage.includes('mood') || lowerMessage.includes('feel')) {
            response = 'Tell me more about your mood! Are you looking for something upbeat and energetic, or maybe something more chill and relaxing?';
            action = 'mood_analysis';
        } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
            response = 'Hello! I\'m your AI music assistant. I can help you discover new music, create playlists, and find the perfect songs for any mood. What would you like to explore today?';
        } else {
            response = 'I\'m here to help you with music recommendations and playlist creation! Try asking me to recommend songs for a specific mood or to create a playlist.';
        }

        res.json({
            response: response,
            action: action,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Failed to process message',
            message: 'Sorry, I encountered an error. Please try again.'
        });
    }
});

// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/playlists', playlistRoutes);

// Enhanced real-time features
const realtimeRecommendationsRoutes = require('./api/routes/realtime-recommendations');
const playlistAutomationRoutes = require('./api/routes/playlist-automation');
app.use('/api/recommendations', realtimeRecommendationsRoutes);
app.use('/api/playlists', playlistAutomationRoutes);

// Socket.IO Real-time Chat Integration
const EchoTuneChatbot = require('./chat/chatbot');

// Initialize chatbot for Socket.IO
const chatbotConfig = {
  llmProviders: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    },
    azure: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-r1-0528:free'
    }
  },
  // Determine the best available provider based on API keys - prioritize Gemini
  defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 
                  (process.env.GEMINI_API_KEY ? 'gemini' : 
                   process.env.OPENAI_API_KEY ? 'openai' : 
                   process.env.OPENROUTER_API_KEY ? 'openrouter' : 'mock'),
  defaultModel: process.env.DEFAULT_LLM_MODEL || 'gemini-1.5-flash',
  enableMockProvider: true
};

let socketChatbot = null;

async function initializeSocketChatbot() {
  if (!socketChatbot) {
    socketChatbot = new EchoTuneChatbot(chatbotConfig);
    await socketChatbot.initialize();
    console.log('🔗 Socket.IO Chatbot initialized');
  }
  return socketChatbot;
}

// Socket.IO connection handling
io.on('connection', async (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  try {
    // Initialize chatbot
    const chatbot = await initializeSocketChatbot();
    
    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected to EchoTune AI',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      providers: chatbot.getAvailableProviders()
    });

    // Handle chat messages
    socket.on('chat_message', async (data) => {
      try {
        const { message, sessionId, provider, userId = `socket_${socket.id}` } = data;
        
        if (!message) {
          socket.emit('error', { message: 'Message is required' });
          return;
        }

        // Emit typing indicator
        socket.emit('typing_start', { timestamp: new Date().toISOString() });

        let activeSessionId = sessionId;
        
        // Create session if not provided
        if (!activeSessionId) {
          const session = await chatbot.startConversation(userId, { provider });
          activeSessionId = session.sessionId;
          socket.emit('session_created', { sessionId: activeSessionId });
        }

        // Send message to chatbot
        const response = await chatbot.sendMessage(activeSessionId, message, {
          provider: provider || chatbot.config.defaultProvider,
          userId
        });

        // Stop typing indicator
        socket.emit('typing_stop');

        // Send response
        socket.emit('chat_response', {
          ...response,
          sessionId: activeSessionId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Socket chat error:', error);
        socket.emit('typing_stop');
        socket.emit('error', {
          message: 'Failed to process message',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle streaming messages
    socket.on('chat_stream', async (data) => {
      try {
        const { message, sessionId, provider, userId = `socket_${socket.id}` } = data;
        
        if (!message) {
          socket.emit('error', { message: 'Message is required' });
          return;
        }

        let activeSessionId = sessionId;
        
        if (!activeSessionId) {
          const session = await chatbot.startConversation(userId, { provider });
          activeSessionId = session.sessionId;
          socket.emit('session_created', { sessionId: activeSessionId });
        }

        // Start streaming
        socket.emit('stream_start', { sessionId: activeSessionId });

        for await (const chunk of chatbot.streamMessage(activeSessionId, message, { provider })) {
          if (chunk.error) {
            socket.emit('stream_error', { error: chunk.error });
            break;
          } else if (chunk.type === 'chunk') {
            socket.emit('stream_chunk', {
              content: chunk.content,
              isPartial: chunk.isPartial,
              sessionId: activeSessionId
            });
          } else if (chunk.type === 'complete') {
            socket.emit('stream_complete', {
              sessionId: activeSessionId,
              totalTime: chunk.totalTime,
              timestamp: new Date().toISOString()
            });
            break;
          }
        }

      } catch (error) {
        console.error('Socket stream error:', error);
        socket.emit('stream_error', {
          message: 'Failed to stream message',
          error: error.message
        });
      }
    });

    // Handle provider switching
    socket.on('switch_provider', async (data) => {
      try {
        const { provider } = data;
        const result = await chatbot.switchProvider(provider);
        
        socket.emit('provider_switched', {
          success: true,
          provider: result.provider,
          message: `Switched to ${provider}`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        socket.emit('provider_switch_error', {
          message: 'Failed to switch provider',
          error: error.message
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });

  } catch (error) {
    console.error('Socket connection initialization error:', error);
    socket.emit('initialization_error', {
      message: 'Failed to initialize chat service',
      error: error.message
    });
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested resource was not found'
    });
});

// Start server
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🎵 EchoTune AI Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 Spotify configured: ${!!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET)}`);
    
    // Initialize database manager with fallback support
    try {
        const databaseManager = require('./database/database-manager');
        // const llmProviderManager = require('./chat/llm-provider-manager');
        
        // Initialize database manager
        const dbInitialized = await databaseManager.initialize();
        if (dbInitialized) {
            console.log('🗄️ Database manager initialized successfully');
            const dbInfo = databaseManager.getActiveDatabase();
            console.log(`📊 Active databases: ${dbInfo.databases.join(', ')}`);
            if (dbInfo.fallbackMode) {
                console.log('📦 Running in fallback mode (SQLite)');
            }
        } else {
            console.error('❌ Database initialization failed - running without database');
        }
        
        // Initialize LLM provider manager
        console.log('🤖 LLM Provider Manager: Using existing chat system');
        const llmProviderManager = require('./chat/llm-provider-manager');
        try {
            await llmProviderManager.initialize();
            console.log('✅ LLM Provider Manager initialized successfully');
            const providerStatus = llmProviderManager.getProviderStatus();
            const available = Object.values(providerStatus.providers).filter(p => p.available).length;
            console.log(`🔌 Available LLM providers: ${available}`);
            console.log(`🎯 Active provider: ${providerStatus.currentProvider}`);
        } catch (error) {
            console.warn('⚠️ LLM Provider Manager initialization warning:', error.message);
            console.log('📦 Running with default mock provider for chat functionality');
        }
        // } else {
        //     console.error('❌ LLM Provider Manager initialization failed');
        // }
        console.log('🤖 LLM Provider Manager: Using existing chat system');
    } catch (error) {
        console.error('❌ System initialization failed:', error.message);
    }
    
    if (process.env.NODE_ENV !== 'production') {
        console.log(`🔗 Local access: http://localhost:${PORT}`);
        console.log(`🎤 Health check: http://localhost:${PORT}/health`);
        console.log(`🤖 Chat API: http://localhost:${PORT}/api/chat`);
        console.log(`📡 Socket.IO: ws://localhost:${PORT}`);
        console.log(`🎯 Recommendations API: http://localhost:${PORT}/api/recommendations`);
        console.log(`🎵 Spotify API: http://localhost:${PORT}/api/spotify`);
    }
});

module.exports = app;