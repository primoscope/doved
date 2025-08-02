const { MongoClient } = require('mongodb');
const SQLiteManager = require('./sqlite-manager');

/**
 * Database Abstraction Layer
 * Provides unified interface for multiple database types with fallback support
 */
class DatabaseManager {
  constructor() {
    this.mongodb = null;
    this.sqlite = null;
    this.supabase = null;
    this.activeDatabases = [];
    this.fallbackMode = false;
    this.initialized = false;
  }

  /**
   * Initialize database connections based on environment configuration
   */
  async initialize() {
    console.log('🔄 Initializing database connections...');
    
    // Try MongoDB first (preferred for analytics)
    if (process.env.MONGODB_URI) {
      try {
        await this.initializeMongoDB();
      } catch (error) {
        console.warn('MongoDB initialization failed:', error.message);
      }
    }

    // Try Supabase (PostgreSQL) for application data
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        await this.initializeSupabase();
      } catch (error) {
        console.warn('Supabase initialization failed:', error.message);
      }
    }

    // Initialize SQLite as fallback
    try {
      await this.initializeSQLite();
    } catch (error) {
      console.error('SQLite initialization failed:', error);
    }

    // Set fallback mode if no primary databases are available
    if (this.activeDatabases.length === 0 || 
        (!this.mongodb && !this.supabase && this.sqlite)) {
      this.fallbackMode = true;
      console.log('📦 Database running in fallback mode (SQLite only)');
    }

    this.initialized = true;
    console.log('✅ Database manager initialized');
    console.log(`📊 Active databases: ${this.activeDatabases.join(', ')}`);
    
    return this.activeDatabases.length > 0;
  }

  /**
   * Initialize MongoDB connection
   */
  async initializeMongoDB() {
    try {
      this.mongodb = new MongoClient(process.env.MONGODB_URI, {
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });

      await this.mongodb.connect();
      
      // Test connection
      await this.mongodb.db().admin().ping();
      
      this.activeDatabases.push('mongodb');
      console.log('✅ MongoDB connected successfully');
      return true;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      this.mongodb = null;
      return false;
    }
  }

  /**
   * Initialize Supabase (PostgreSQL) connection
   */
  async initializeSupabase() {
    try {
      // Import Supabase client
      const { createClient } = require('@supabase/supabase-js');
      
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Test connection
      const { data: _data, error } = await this.supabase
        .from('test')
        .select('*')
        .limit(1);

      if (error && error.code !== 'PGRST116') { // Table not found is ok
        throw error;
      }

      this.activeDatabases.push('supabase');
      console.log('✅ Supabase connected successfully');
      return true;
    } catch (error) {
      console.error('❌ Supabase connection failed:', error.message);
      this.supabase = null;
      return false;
    }
  }

  /**
   * Initialize SQLite fallback database
   */
  async initializeSQLite() {
    try {
      this.sqlite = new SQLiteManager();
      const success = await this.sqlite.initialize();
      
      if (success) {
        this.activeDatabases.push('sqlite');
        console.log('✅ SQLite fallback database ready');
        return true;
      } else {
        throw new Error('SQLite initialization failed');
      }
    } catch (error) {
      console.error('❌ SQLite initialization failed:', error.message);
      this.sqlite = null;
      return false;
    }
  }

  /**
   * Save user data to available databases
   */
  async saveUser(userData) {
    const results = [];

    // Try MongoDB first
    if (this.mongodb) {
      try {
        const db = this.mongodb.db(process.env.MONGODB_DATABASE || 'spotify_analytics');
        const collection = db.collection('users');
        
        const _result = await collection.replaceOne(
          { id: userData.id },
          { ...userData, updated_at: new Date() },
          { upsert: true }
        );
        
        results.push({ database: 'mongodb', success: true, id: userData.id });
      } catch (error) {
        console.error('MongoDB save user error:', error);
        results.push({ database: 'mongodb', success: false, error: error.message });
      }
    }

    // Try Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('users')
          .upsert([userData])
          .select();

        if (error) throw error;
        
        results.push({ database: 'supabase', success: true, data });
      } catch (error) {
        console.error('Supabase save user error:', error);
        results.push({ database: 'supabase', success: false, error: error.message });
      }
    }

    // Always save to SQLite as backup
    if (this.sqlite) {
      const result = await this.sqlite.saveUser(userData);
      results.push({ database: 'sqlite', ...result });
    }

    return {
      success: results.some(r => r.success),
      results,
      primary: results.find(r => r.success && r.database !== 'sqlite')?.database || 'sqlite'
    };
  }

  /**
   * Save listening history
   */
  async saveListeningHistory(userId, tracks) {
    const results = [];

    // MongoDB
    if (this.mongodb) {
      try {
        const db = this.mongodb.db(process.env.MONGODB_DATABASE || 'spotify_analytics');
        const collection = db.collection('listening_history');
        
        const documents = tracks.map(track => ({
          userId,
          trackId: track.id || track.track_id,
          trackName: track.name || track.track_name,
          artistName: track.artists?.[0]?.name || track.artist_name,
          albumName: track.album?.name || track.album_name,
          playedAt: new Date(track.played_at),
          durationMs: track.duration_ms,
          audioFeatures: track.audio_features || {},
          createdAt: new Date()
        }));

        const result = await collection.insertMany(documents, { ordered: false });
        results.push({ database: 'mongodb', success: true, inserted: result.insertedCount });
      } catch (error) {
        console.error('MongoDB save listening history error:', error);
        results.push({ database: 'mongodb', success: false, error: error.message });
      }
    }

    // SQLite fallback
    if (this.sqlite) {
      const result = await this.sqlite.saveListeningHistory(userId, tracks);
      results.push({ database: 'sqlite', ...result });
    }

    return {
      success: results.some(r => r.success),
      results
    };
  }

  /**
   * Get recommendations
   */
  async getRecommendations(userId, options = {}) {
    const limit = options.limit || 20;

    // Try MongoDB first
    if (this.mongodb) {
      try {
        const db = this.mongodb.db(process.env.MONGODB_DATABASE || 'spotify_analytics');
        const collection = db.collection('recommendations');
        
        const recommendations = await collection
          .find({ userId })
          .sort({ score: -1, createdAt: -1 })
          .limit(limit)
          .toArray();

        return { success: true, recommendations, source: 'mongodb' };
      } catch (error) {
        console.error('MongoDB get recommendations error:', error);
      }
    }

    // Fallback to SQLite
    if (this.sqlite) {
      const result = await this.sqlite.getRecommendations(userId, limit);
      if (result.success) {
        return { ...result, source: 'sqlite' };
      }
    }

    return { success: false, error: 'No available database for recommendations' };
  }

  /**
   * Get analytics data
   */
  async getAnalytics(userId, options = {}) {
    // Try MongoDB first (better for analytics)
    if (this.mongodb) {
      try {
        const db = this.mongodb.db(process.env.MONGODB_DATABASE || 'spotify_analytics');
        
        // Aggregate listening data
        const pipeline = [
          { $match: { userId } },
          {
            $group: {
              _id: null,
              totalTracks: { $sum: 1 },
              uniqueArtists: { $addToSet: '$artistName' },
              avgDuration: { $avg: '$durationMs' }
            }
          },
          {
            $project: {
              totalTracks: 1,
              uniqueArtists: { $size: '$uniqueArtists' },
              avgDuration: 1
            }
          }
        ];

        const analytics = await db.collection('listening_history').aggregate(pipeline).toArray();
        
        // Get top artists
        const topArtists = await db.collection('listening_history').aggregate([
          { $match: { userId } },
          { $group: { _id: '$artistName', playCount: { $sum: 1 } } },
          { $sort: { playCount: -1 } },
          { $limit: 10 },
          { $project: { artist_name: '$_id', play_count: '$playCount' } }
        ]).toArray();

        return {
          success: true,
          analytics: {
            ...analytics[0],
            top_artists: topArtists
          },
          source: 'mongodb'
        };
      } catch (error) {
        console.error('MongoDB get analytics error:', error);
      }
    }

    // Fallback to SQLite
    if (this.sqlite) {
      const result = await this.sqlite.getAnalytics(userId, options);
      if (result.success) {
        return { ...result, source: 'sqlite' };
      }
    }

    return { success: false, error: 'No available database for analytics' };
  }

  /**
   * Health check for all databases
   */
  async healthCheck() {
    const status = {
      mongodb: { connected: false, status: 'disconnected' },
      supabase: { connected: false, status: 'disconnected' },
      sqlite: { connected: false, status: 'disconnected' }
    };

    // Check MongoDB
    if (this.mongodb) {
      try {
        await this.mongodb.db().admin().ping();
        status.mongodb = { connected: true, status: 'healthy' };
      } catch (error) {
        status.mongodb = { connected: false, status: 'error', error: error.message };
      }
    }

    // Check Supabase
    if (this.supabase) {
      try {
        const { data: _data, error: _error } = await this.supabase.from('test').select('*').limit(1);
        status.supabase = { connected: true, status: 'healthy' };
      } catch (error) {
        status.supabase = { connected: false, status: 'error', error: error.message };
      }
    }

    // Check SQLite
    if (this.sqlite) {
      const sqliteStatus = await this.sqlite.healthCheck();
      status.sqlite = sqliteStatus;
    }

    return {
      connections: status,
      active: this.activeDatabases,
      fallbackMode: this.fallbackMode,
      healthy: this.activeDatabases.length > 0
    };
  }

  /**
   * Close all database connections
   */
  async close() {
    const promises = [];

    if (this.mongodb) {
      promises.push(this.mongodb.close());
    }

    if (this.sqlite) {
      this.sqlite.close();
    }

    await Promise.all(promises);
    console.log('📦 All database connections closed');
  }

  /**
   * Get active database info
   */
  getActiveDatabase() {
    return {
      databases: this.activeDatabases,
      fallbackMode: this.fallbackMode,
      primary: this.activeDatabases.find(db => db !== 'sqlite') || 'sqlite'
    };
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;