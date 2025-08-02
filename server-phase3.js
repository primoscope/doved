/**
 * Phase 3 Enhanced EchoTune AI Server
 * Integrates new Provider Manager, Database Fallback, and Error Handling
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Phase 3 Components
const ProviderManager = require('./src/api/providers/ProviderManager');
const DatabaseManager = require('./src/api/database/DatabaseManager');
const {
  timeoutMiddleware,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  rateLimiter,
  healthCheck,
  requestLogger,
  corsHandler,
  APIError
} = require('./src/api/middleware/errorHandling');

class Phase3Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    
    this.port = process.env.PORT || 3000;
    this.initialized = false;
    this.stats = {
      requests: 0,
      chatMessages: 0,
      activeConnections: 0,
      uptime: Date.now()
    };
  }

  /**
   * Initialize server with all Phase 3 components
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Phase 3 EchoTune AI Server...');
      
      // Initialize core components
      await this.initializeProviders();
      await this.initializeDatabase();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup error handling
      this.setupErrorHandling();
      
      this.initialized = true;
      console.log('✅ Phase 3 Server fully initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Provider Manager
   */
  async initializeProviders() {
    console.log('🤖 Initializing Provider Manager...');
    const success = await ProviderManager.initialize();
    
    if (success) {
      console.log('✅ Provider Manager initialized with enhanced failover');
    } else {
      console.log('⚠️ Provider Manager using fallback mode');
    }
  }

  /**
   * Initialize Database Manager
   */
  async initializeDatabase() {
    console.log('🗄️ Initializing Database Manager...');
    const success = await DatabaseManager.initialize();
    
    if (success) {
      console.log('✅ Database Manager initialized with fallback support');
    } else {
      console.log('⚠️ Database Manager using emergency fallback');
    }
  }

  /**
   * Setup middleware stack
   */
  setupMiddleware() {
    // Request logging and ID generation
    this.app.use(requestLogger);
    
    // CORS with enhanced options
    this.app.use(corsHandler({
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.FRONTEND_URL
      ].filter(Boolean)
    }));
    
    // Parse JSON with limit
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Global timeout
    this.app.use(timeoutMiddleware(30000));
    
    // Rate limiting
    this.app.use(rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // More generous limit for development
      message: 'Too many requests, please slow down'
    }));
    
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use('/src', express.static(path.join(__dirname, 'src')));
    
    // Request stats
    this.app.use((req, res, next) => {
      this.stats.requests++;
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check with detailed system status
    this.app.get('/health', healthCheck({
      providers: async () => {
        const status = ProviderManager.getStatus();
        if (status.activeProviders === 0) {
          throw new Error('No providers available');
        }
        return status;
      },
      database: async () => {
        const status = DatabaseManager.getStatus();
        if (!status.initialized) {
          throw new Error('Database not initialized');
        }
        return status;
      }
    }));

    // Enhanced chat API
    this.app.post('/api/chat/message', 
      rateLimiter({ max: 60, windowMs: 60 * 1000 }), // 60 per minute for chat
      asyncHandler(async (req, res) => {
        const { message, sessionId, userId } = req.body;
        
        if (!message || typeof message !== 'string') {
          throw new APIError('Message is required', 400, 'INVALID_MESSAGE');
        }

        const startTime = Date.now();
        
        try {
          // Send message to LLM provider with automatic failover
          const result = await ProviderManager.sendMessage(message, {
            context: 'music_recommendation',
            userId,
            sessionId
          });

          // Save to database
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await DatabaseManager.saveChatMessage({
            id: messageId,
            sessionId: sessionId || 'default',
            role: 'user',
            content: message,
            provider: result.provider,
            model: result.model,
            tokens: result.response?.length || 0,
            responseTime: result.responseTime
          });

          // Update stats
          this.stats.chatMessages++;

          res.json({
            success: true,
            response: result.response,
            provider: result.provider,
            model: result.model,
            responseTime: Date.now() - startTime,
            sessionId: sessionId || 'default',
            messageId,
            fallback: result.fallback || false,
            metadata: {
              tokens: result.response?.length || 0,
              provider_response_time: result.responseTime
            }
          });

        } catch (error) {
          console.error('Chat message error:', error);
          throw new APIError(
            'Failed to process chat message',
            500,
            'CHAT_ERROR',
            { originalError: error.message }
          );
        }
      })
    );

    // Provider status API
    this.app.get('/api/providers/status', asyncHandler(async (req, res) => {
      const status = ProviderManager.getStatus();
      res.json({
        success: true,
        ...status
      });
    }));

    // Database status API
    this.app.get('/api/database/status', asyncHandler(async (req, res) => {
      const status = DatabaseManager.getStatus();
      res.json({
        success: true,
        ...status
      });
    }));

    // Chat sessions API
    this.app.get('/api/chat/sessions/:userId', asyncHandler(async (req, res) => {
      const { userId } = req.params;
      const sessions = await DatabaseManager.getChatSessions(userId);
      
      res.json({
        success: true,
        sessions
      });
    }));

    // Server statistics API
    this.app.get('/api/stats', asyncHandler(async (req, res) => {
      const providerStatus = ProviderManager.getStatus();
      const databaseStatus = DatabaseManager.getStatus();
      
      res.json({
        success: true,
        server: {
          ...this.stats,
          uptime: Date.now() - this.stats.uptime,
          memory: process.memoryUsage(),
          activeConnections: this.stats.activeConnections
        },
        providers: providerStatus,
        database: databaseStatus
      });
    }));

    // Spotify integration routes (placeholder for now)
    this.app.get('/api/spotify/auth', asyncHandler(async (req, res) => {
      // TODO: Implement Spotify OAuth
      res.json({
        success: false,
        message: 'Spotify integration coming in next phase',
        redirectUrl: '#'
      });
    }));

    // Recommendations API
    this.app.post('/api/recommendations', asyncHandler(async (req, res) => {
      const { query, userId, sessionId } = req.body;
      
      // For now, use chat interface for recommendations
      const result = await ProviderManager.sendMessage(
        `Please recommend music based on: ${query}`,
        { userId, sessionId }
      );
      
      res.json({
        success: true,
        recommendations: result.response,
        provider: result.provider,
        sessionId
      });
    }));

    // Frontend routes
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    this.app.get('/chat', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    });

    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });
  }

  /**
   * Setup WebSocket for real-time communication
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      this.stats.activeConnections++;
      console.log(`🔌 Client connected: ${socket.id} (Total: ${this.stats.activeConnections})`);

      // Join user to their personal room
      socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`👤 User ${userId} joined personal room`);
      });

      // Handle chat messages via WebSocket
      socket.on('chat_message', async (data) => {
        try {
          const { message, sessionId, userId } = data;
          
          // Emit typing indicator
          socket.emit('typing', { typing: true });
          
          // Process message
          const result = await ProviderManager.sendMessage(message, {
            context: 'music_recommendation',
            userId,
            sessionId
          });

          // Save to database
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await DatabaseManager.saveChatMessage({
            id: messageId,
            sessionId: sessionId || 'default',
            role: 'assistant',
            content: result.response,
            provider: result.provider,
            model: result.model,
            tokens: result.response?.length || 0,
            responseTime: result.responseTime
          });

          // Stop typing indicator
          socket.emit('typing', { typing: false });

          // Send response
          socket.emit('chat_response', {
            messageId,
            response: result.response,
            provider: result.provider,
            model: result.model,
            sessionId: sessionId || 'default',
            timestamp: new Date().toISOString()
          });

          this.stats.chatMessages++;

        } catch (error) {
          console.error('WebSocket chat error:', error);
          socket.emit('chat_error', {
            error: 'Failed to process message',
            message: error.message
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.stats.activeConnections--;
        console.log(`🔌 Client disconnected: ${socket.id} (Total: ${this.stats.activeConnections})`);
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);
    
    // Global error handler
    this.app.use(errorHandler);
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📴 SIGTERM received, shutting down gracefully...');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      console.log('📴 SIGINT received, shutting down gracefully...');
      this.shutdown();
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      this.server.listen(this.port, () => {
        console.log('🎵 ================================');
        console.log('🎵 EchoTune AI - Phase 3 Server');
        console.log('🎵 ================================');
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`🌐 Web Interface: http://localhost:${this.port}`);
        console.log(`💬 Chat Interface: http://localhost:${this.port}/chat`);
        console.log(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
        console.log(`🏥 Health Check: http://localhost:${this.port}/health`);
        console.log('🎵 ================================');
        
        // Log system status
        this.logSystemStatus();
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Log current system status
   */
  logSystemStatus() {
    setTimeout(async () => {
      const providerStatus = ProviderManager.getStatus();
      const databaseStatus = DatabaseManager.getStatus();
      
      console.log('📊 System Status:');
      console.log(`   🤖 Providers: ${providerStatus.activeProviders}/${providerStatus.totalProviders} active`);
      console.log(`   🗄️ Database: ${databaseStatus.connectionType}`);
      console.log(`   💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   🔌 Connections: ${this.stats.activeConnections}`);
      console.log('🎵 ================================');
    }, 1000);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down server...');
    
    try {
      // Close server
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      
      // Close database connections
      await DatabaseManager.close();
      
      console.log('✅ Server shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start server
const server = new Phase3Server();

if (require.main === module) {
  server.start().catch(error => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = server;