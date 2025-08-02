const { MongoClient } = require('mongodb');

/**
 * MongoDB Connection Manager for EchoTune AI
 * Handles database connections, collections, and basic operations
 */
class MongoDBManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI;
    this.databaseName = process.env.MONGODB_DATABASE || 'echotune_ai';
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      if (this.isConnected) {
        return this.db;
      }

      if (!this.connectionString) {
        throw new Error('MongoDB connection string not provided. Set MONGODB_URI environment variable.');
      }

      this.client = new MongoClient(this.connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      await this.client.db('admin').command({ ping: 1 });
      
      this.db = this.client.db(this.databaseName);
      this.isConnected = true;

      console.log('✅ Connected to MongoDB successfully');
      return this.db;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error.message);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get collection
   */
  getCollection(name) {
    return this.getDb().collection(name);
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.client = null;
      this.db = null;
      console.log('🔌 MongoDB connection closed');
    }
  }

  /**
   * Create indexes for collections
   */
  async createIndexes() {
    try {
      const db = this.getDb();

      // User profiles collection indexes
      const userProfilesCollection = db.collection('user_profiles');
      await userProfilesCollection.createIndexes([
        { key: { spotify_id: 1 }, unique: true },
        { key: { email: 1 }, unique: true, sparse: true },
        { key: { created_at: 1 } }
      ]);

      // Listening history collection indexes
      const listeningHistoryCollection = db.collection('listening_history');
      await listeningHistoryCollection.createIndexes([
        { key: { user_id: 1, played_at: -1 } },
        { key: { track_id: 1 } },
        { key: { played_at: -1 } },
        { key: { user_id: 1, track_id: 1 } }
      ]);

      // Track metadata collection indexes
      const trackMetadataCollection = db.collection('track_metadata');
      await trackMetadataCollection.createIndexes([
        { key: { track_id: 1 }, unique: true },
        { key: { artist_id: 1 } },
        { key: { album_id: 1 } },
        { key: { genres: 1 } },
        { key: { popularity: -1 } }
      ]);

      // Audio features collection indexes
      const audioFeaturesCollection = db.collection('audio_features');
      await audioFeaturesCollection.createIndexes([
        { key: { track_id: 1 }, unique: true },
        { key: { energy: 1 } },
        { key: { valence: 1 } },
        { key: { danceability: 1 } },
        { key: { acousticness: 1 } }
      ]);

      // Recommendations collection indexes
      const recommendationsCollection = db.collection('recommendations');
      await recommendationsCollection.createIndexes([
        { key: { user_id: 1, created_at: -1 } },
        { key: { recommendation_type: 1 } },
        { key: { created_at: 1 }, expireAfterSeconds: 2592000 } // 30 days TTL
      ]);

      // Chat history collection indexes
      const chatHistoryCollection = db.collection('chat_history');
      await chatHistoryCollection.createIndexes([
        { key: { user_id: 1, timestamp: -1 } },
        { key: { session_id: 1 } },
        { key: { timestamp: 1 }, expireAfterSeconds: 7776000 } // 90 days TTL
      ]);

      // Playlists collection indexes
      const playlistsCollection = db.collection('playlists');
      await playlistsCollection.createIndexes([
        { key: { user_id: 1, created_at: -1 } },
        { key: { spotify_playlist_id: 1 }, unique: true, sparse: true },
        { key: { playlist_type: 1 } }
      ]);

      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating indexes:', error.message);
      throw error;
    }
  }

  /**
   * Health check for database connection
   */
  async healthCheck() {
    try {
      await this.client.db('admin').command({ ping: 1 });
      return { status: 'healthy', database: this.databaseName };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

// Create singleton instance
const mongoManager = new MongoDBManager();

module.exports = mongoManager;