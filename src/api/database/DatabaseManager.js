/**
 * Phase 3 Database Connection Manager
 * Implements SQLite fallback with MongoDB production support
 */

const fs = require('fs').promises;
const path = require('path');

class DatabaseManager {
  constructor() {
    this.primaryConnection = null;
    this.fallbackConnection = null;
    this.currentConnection = null;
    this.connectionType = null;
    this.initialized = false;
    this.monitoring = false;
    this.stats = {
      queries: 0,
      successes: 0,
      failures: 0,
      fallbacks: 0
    };
  }

  /**
   * Initialize database connections with automatic fallback
   */
  async initialize() {
    try {
      console.log('🗄️ Initializing Phase 3 Database Manager...');
      
      // Try MongoDB first (production)
      await this.initializeMongoDB();
      
      // Initialize SQLite fallback (development)
      await this.initializeSQLite();
      
      // Set current connection
      await this.selectBestConnection();
      
      // Start monitoring
      await this.startMonitoring();
      
      this.initialized = true;
      console.log(`✅ Database Manager initialized using ${this.connectionType}`);
      
      return true;
    } catch (error) {
      console.error('❌ Database Manager initialization failed:', error);
      
      // Emergency fallback to SQLite
      if (!this.fallbackConnection) {
        await this.initializeSQLite();
      }
      
      this.currentConnection = this.fallbackConnection;
      this.connectionType = 'sqlite';
      this.initialized = true;
      
      console.log('⚠️ Using SQLite emergency fallback');
      return false;
    }
  }

  /**
   * Initialize MongoDB connection
   */
  async initializeMongoDB() {
    try {
      const mongoUri = process.env.MONGODB_URI;
      
      if (!mongoUri || mongoUri.includes('username:password')) {
        console.log('⚠️ MongoDB credentials not configured, skipping...');
        return false;
      }

      const { MongoClient } = require('mongodb');
      
      const client = new MongoClient(mongoUri, {
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await client.connect();
      
      // Test connection
      await client.db().admin().ping();
      
      this.primaryConnection = {
        client,
        db: client.db(process.env.MONGODB_DATABASE || 'echotune'),
        type: 'mongodb'
      };
      
      console.log('✅ MongoDB connection established');
      return true;
    } catch (error) {
      console.log(`⚠️ MongoDB connection failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialize SQLite fallback connection
   */
  async initializeSQLite() {
    try {
      const { Database } = require('sqlite3');
      
      // Ensure data directory exists
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      
      const dbPath = path.join(dataDir, 'echotune_dev.db');
      
      return new Promise((resolve, reject) => {
        const db = new Database(dbPath, (err) => {
          if (err) {
            console.error('SQLite connection error:', err);
            reject(err);
            return;
          }
          
          // Initialize schema
          this.initializeSQLiteSchema(db)
            .then(() => {
              this.fallbackConnection = {
                db,
                type: 'sqlite',
                path: dbPath
              };
              
              console.log('✅ SQLite fallback connection established');
              resolve(true);
            })
            .catch(reject);
        });
      });
    } catch (error) {
      console.error('❌ SQLite initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize SQLite database schema
   */
  async initializeSQLiteSchema(db) {
    const schemas = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        spotify_id TEXT UNIQUE,
        display_name TEXT,
        email TEXT,
        profile_image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Chat sessions table
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // Chat messages table
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        role TEXT CHECK (role IN ('user', 'assistant')),
        content TEXT,
        provider TEXT,
        model TEXT,
        tokens INTEGER,
        response_time INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
      )`,
      
      // Music recommendations table
      `CREATE TABLE IF NOT EXISTS music_recommendations (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        track_id TEXT,
        track_name TEXT,
        artist_name TEXT,
        album_name TEXT,
        preview_url TEXT,
        spotify_url TEXT,
        confidence_score REAL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
      )`,
      
      // User listening history table
      `CREATE TABLE IF NOT EXISTS listening_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        track_id TEXT,
        track_name TEXT,
        artist_name TEXT,
        album_name TEXT,
        played_at DATETIME,
        play_duration INTEGER,
        skipped BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // System health logs table
      `CREATE TABLE IF NOT EXISTS system_health (
        id TEXT PRIMARY KEY,
        component TEXT,
        status TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users (spotify_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages (session_id)',
      'CREATE INDEX IF NOT EXISTS idx_music_recommendations_session_id ON music_recommendations (session_id)',
      'CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history (played_at)',
      'CREATE INDEX IF NOT EXISTS idx_system_health_component ON system_health (component)',
      'CREATE INDEX IF NOT EXISTS idx_system_health_timestamp ON system_health (timestamp)'
    ];

    return new Promise((resolve, reject) => {
      const executeQueries = async (queries) => {
        for (const query of queries) {
          await new Promise((resolveQuery, rejectQuery) => {
            db.run(query, (err) => {
              if (err) {
                console.error('Schema creation error:', err);
                rejectQuery(err);
                return;
              }
              
              resolveQuery();
            });
          });
        }
      };

      // Execute schemas first, then indexes
      executeQueries(schemas)
        .then(() => executeQueries(indexes))
        .then(() => resolve())
        .catch(reject);
    });
  }

  /**
   * Select the best available database connection
   */
  async selectBestConnection() {
    if (this.primaryConnection) {
      try {
        // Test MongoDB connection
        await this.primaryConnection.client.db().admin().ping();
        this.currentConnection = this.primaryConnection;
        this.connectionType = 'mongodb';
        return 'mongodb';
      } catch (error) {
        console.log('⚠️ MongoDB connection test failed, falling back to SQLite');
      }
    }

    if (this.fallbackConnection) {
      this.currentConnection = this.fallbackConnection;
      this.connectionType = 'sqlite';
      return 'sqlite';
    }

    throw new Error('No database connections available');
  }

  /**
   * Save chat session to database
   */
  async saveChatSession(sessionData) {
    this.stats.queries++;
    
    try {
      if (this.connectionType === 'mongodb') {
        const collection = this.currentConnection.db.collection('chat_sessions');
        const result = await collection.insertOne({
          _id: sessionData.id,
          ...sessionData,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        this.stats.successes++;
        return result.insertedId;
      } else {
        // SQLite
        return new Promise((resolve, reject) => {
          const stmt = this.currentConnection.db.prepare(`
            INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `);
          
          stmt.run([
            sessionData.id,
            sessionData.userId,
            sessionData.title
          ], function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(sessionData.id);
          });
          
          stmt.finalize();
        });
      }
    } catch (error) {
      this.stats.failures++;
      console.error('Save chat session error:', error);
      
      // Try fallback if using MongoDB
      if (this.connectionType === 'mongodb' && this.fallbackConnection) {
        this.stats.fallbacks++;
        console.log('Falling back to SQLite for chat session save');
        
        const originalConnection = this.currentConnection;
        const originalType = this.connectionType;
        
        this.currentConnection = this.fallbackConnection;
        this.connectionType = 'sqlite';
        
        try {
          const result = await this.saveChatSession(sessionData);
          return result;
        } finally {
          this.currentConnection = originalConnection;
          this.connectionType = originalType;
        }
      }
      
      throw error;
    }
  }

  /**
   * Save chat message to database
   */
  async saveChatMessage(messageData) {
    this.stats.queries++;
    
    try {
      if (this.connectionType === 'mongodb') {
        const collection = this.currentConnection.db.collection('chat_messages');
        const result = await collection.insertOne({
          _id: messageData.id,
          ...messageData,
          createdAt: new Date()
        });
        
        this.stats.successes++;
        return result.insertedId;
      } else {
        // SQLite
        return new Promise((resolve, reject) => {
          const stmt = this.currentConnection.db.prepare(`
            INSERT INTO chat_messages (id, session_id, role, content, provider, model, tokens, response_time, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);
          
          stmt.run([
            messageData.id,
            messageData.sessionId,
            messageData.role,
            messageData.content,
            messageData.provider,
            messageData.model,
            messageData.tokens,
            messageData.responseTime
          ], function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(messageData.id);
          });
          
          stmt.finalize();
        });
      }
    } catch (error) {
      this.stats.failures++;
      console.error('Save chat message error:', error);
      throw error;
    }
  }

  /**
   * Get chat sessions for user
   */
  async getChatSessions(userId, limit = 50) {
    this.stats.queries++;
    
    try {
      if (this.connectionType === 'mongodb') {
        const collection = this.currentConnection.db.collection('chat_sessions');
        const sessions = await collection
          .find({ userId })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .toArray();
        
        this.stats.successes++;
        return sessions;
      } else {
        // SQLite
        return new Promise((resolve, reject) => {
          this.currentConnection.db.all(`
            SELECT * FROM chat_sessions 
            WHERE user_id = ? 
            ORDER BY updated_at DESC 
            LIMIT ?
          `, [userId, limit], (err, rows) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(rows);
          });
        });
      }
    } catch (error) {
      this.stats.failures++;
      console.error('Get chat sessions error:', error);
      return [];
    }
  }

  /**
   * Save music recommendation
   */
  async saveMusicRecommendation(recommendationData) {
    this.stats.queries++;
    
    try {
      if (this.connectionType === 'mongodb') {
        const collection = this.currentConnection.db.collection('music_recommendations');
        const result = await collection.insertOne({
          _id: recommendationData.id,
          ...recommendationData,
          createdAt: new Date()
        });
        
        this.stats.successes++;
        return result.insertedId;
      } else {
        // SQLite
        return new Promise((resolve, reject) => {
          const stmt = this.currentConnection.db.prepare(`
            INSERT INTO music_recommendations 
            (id, session_id, track_id, track_name, artist_name, album_name, preview_url, spotify_url, confidence_score, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);
          
          stmt.run([
            recommendationData.id,
            recommendationData.sessionId,
            recommendationData.trackId,
            recommendationData.trackName,
            recommendationData.artistName,
            recommendationData.albumName,
            recommendationData.previewUrl,
            recommendationData.spotifyUrl,
            recommendationData.confidenceScore,
            recommendationData.reason
          ], function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(recommendationData.id);
          });
          
          stmt.finalize();
        });
      }
    } catch (error) {
      this.stats.failures++;
      console.error('Save music recommendation error:', error);
      throw error;
    }
  }

  /**
   * Log system health status
   */
  async logSystemHealth(component, status, details = '') {
    try {
      const healthData = {
        id: `${component}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        component,
        status,
        details: JSON.stringify(details),
        timestamp: new Date().toISOString()
      };

      if (this.connectionType === 'mongodb') {
        const collection = this.currentConnection.db.collection('system_health');
        await collection.insertOne(healthData);
      } else {
        // SQLite
        return new Promise((resolve, reject) => {
          const stmt = this.currentConnection.db.prepare(`
            INSERT INTO system_health (id, component, status, details, timestamp)
            VALUES (?, ?, ?, ?, datetime('now'))
          `);
          
          stmt.run([
            healthData.id,
            healthData.component,
            healthData.status,
            healthData.details
          ], function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(healthData.id);
          });
          
          stmt.finalize();
        });
      }
    } catch (error) {
      console.error('Log system health error:', error);
    }
  }

  /**
   * Start database monitoring
   */
  async startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    console.log('📊 Starting database monitoring...');
    
    // Health check every 2 minutes
    setInterval(async () => {
      await this.performHealthCheck();
    }, 2 * 60 * 1000);
    
    // Statistics logging every 5 minutes
    setInterval(() => {
      this.logStatistics();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform database health check
   */
  async performHealthCheck() {
    try {
      if (this.connectionType === 'mongodb' && this.primaryConnection) {
        try {
          await this.primaryConnection.client.db().admin().ping();
          await this.logSystemHealth('database', 'healthy', {
            type: 'mongodb',
            stats: this.stats
          });
        } catch (error) {
          console.log('⚠️ MongoDB health check failed, switching to SQLite');
          await this.selectBestConnection();
          await this.logSystemHealth('database', 'failover', {
            from: 'mongodb',
            to: 'sqlite',
            error: error.message
          });
        }
      }
      
      if (this.connectionType === 'sqlite') {
        // Simple SQLite health check
        return new Promise((resolve) => {
          this.currentConnection.db.get('SELECT 1', (err) => {
            if (err) {
              console.error('SQLite health check failed:', err);
            }
            resolve(!err);
          });
        });
      }
    } catch (error) {
      console.error('Database health check error:', error);
    }
  }

  /**
   * Log database statistics
   */
  logStatistics() {
    const successRate = this.stats.queries > 0 ? 
      ((this.stats.successes / this.stats.queries) * 100).toFixed(1) : 0;
    
    console.log('📊 Database Statistics:');
    console.log(`   Connection: ${this.connectionType}`);
    console.log(`   Queries: ${this.stats.queries}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Fallbacks: ${this.stats.fallbacks}`);
  }

  /**
   * Get database status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      monitoring: this.monitoring,
      connectionType: this.connectionType,
      primaryAvailable: !!this.primaryConnection,
      fallbackAvailable: !!this.fallbackConnection,
      statistics: this.stats,
      health: {
        mongodb: this.primaryConnection ? 'available' : 'unavailable',
        sqlite: this.fallbackConnection ? 'available' : 'unavailable'
      }
    };
  }

  /**
   * Close database connections
   */
  async close() {
    try {
      if (this.primaryConnection) {
        await this.primaryConnection.client.close();
      }
      
      if (this.fallbackConnection) {
        this.fallbackConnection.db.close();
      }
      
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('Error closing database connections:', error);
    }
  }
}

// Export singleton instance
module.exports = new DatabaseManager();