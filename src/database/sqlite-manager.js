const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * SQLite Database Manager
 * Provides fallback database functionality for development environments
 */
class SQLiteManager {
  constructor() {
    this.db = null;
    this.dbPath = path.join(process.cwd(), 'data', 'echotune.db');
    this.connected = false;
    this.initialized = false;
  }

  /**
   * Initialize SQLite database with required tables
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error('SQLite connection error:', err.message);
          throw err;
        }
        console.log('✅ SQLite database connected successfully');
        this.connected = true;
      });

      // Create tables
      await this.createTables();
      this.initialized = true;

      return true;
    } catch (error) {
      console.error('SQLite initialization error:', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        email TEXT,
        country TEXT,
        premium BOOLEAN DEFAULT FALSE,
        followers INTEGER DEFAULT 0,
        spotify_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Listening history table
      `CREATE TABLE IF NOT EXISTS listening_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        track_name TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        album_name TEXT,
        played_at DATETIME NOT NULL,
        duration_ms INTEGER,
        audio_features TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Recommendations table
      `CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        track_name TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        album_name TEXT,
        score REAL NOT NULL,
        reason TEXT,
        context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Playlists table
      `CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        tracks TEXT,
        spotify_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Analytics table
      `CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        metric_value TEXT NOT NULL,
        date_range TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Chat history table
      `CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        session_id TEXT NOT NULL,
        message TEXT NOT NULL,
        sender TEXT NOT NULL,
        provider TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.runQuery(table);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at)',
      'CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_recommendations_score ON recommendations(score)',
      'CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id)'
    ];

    for (const index of indexes) {
      await this.runQuery(index);
    }

    console.log('✅ SQLite tables created successfully');
  }

  /**
   * Execute a query with promise wrapper
   */
  runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get query results
   */
  getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all query results
   */
  getAllQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Save user data
   */
  async saveUser(userData) {
    try {
      const query = `
        INSERT OR REPLACE INTO users 
        (id, display_name, email, country, premium, followers, spotify_data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const params = [
        userData.id,
        userData.display_name,
        userData.email,
        userData.country,
        userData.premium || false,
        userData.followers?.total || 0,
        JSON.stringify(userData)
      ];

      const _result = await this.runQuery(query, params);
      return { success: true, id: userData.id };
    } catch (error) {
      console.error('Save user error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save listening history
   */
  async saveListeningHistory(userId, tracks) {
    try {
      const query = `
        INSERT INTO listening_history 
        (user_id, track_id, track_name, artist_name, album_name, played_at, duration_ms, audio_features)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const track of tracks) {
        const params = [
          userId,
          track.id || track.track_id,
          track.name || track.track_name,
          track.artists?.[0]?.name || track.artist_name,
          track.album?.name || track.album_name,
          track.played_at,
          track.duration_ms,
          JSON.stringify(track.audio_features || {})
        ];

        await this.runQuery(query, params);
      }

      return { success: true, saved: tracks.length };
    } catch (error) {
      console.error('Save listening history error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get recommendations for user
   */
  async getRecommendations(userId, limit = 20) {
    try {
      const query = `
        SELECT * FROM recommendations 
        WHERE user_id = ? 
        ORDER BY score DESC, created_at DESC 
        LIMIT ?
      `;
      
      const rows = await this.getAllQuery(query, [userId, limit]);
      return { success: true, recommendations: rows };
    } catch (error) {
      console.error('Get recommendations error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save playlist
   */
  async savePlaylist(playlistData) {
    try {
      const query = `
        INSERT OR REPLACE INTO playlists 
        (id, user_id, name, description, tracks, spotify_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const params = [
        playlistData.id,
        playlistData.user_id,
        playlistData.name,
        playlistData.description,
        JSON.stringify(playlistData.tracks || []),
        playlistData.spotify_id
      ];

      await this.runQuery(query, params);
      return { success: true, id: playlistData.id };
    } catch (error) {
      console.error('Save playlist error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(userId, options = {}) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_tracks,
          COUNT(DISTINCT artist_name) as unique_artists,
          AVG(duration_ms) as avg_duration
        FROM listening_history 
        WHERE user_id = ?
      `;
      
      const params = [userId];
      
      if (options.dateFrom) {
        query += ' AND played_at >= ?';
        params.push(options.dateFrom);
      }
      
      if (options.dateTo) {
        query += ' AND played_at <= ?';
        params.push(options.dateTo);
      }

      const result = await this.getQuery(query, params);
      
      // Get top artists
      const topArtistsQuery = `
        SELECT artist_name, COUNT(*) as play_count
        FROM listening_history 
        WHERE user_id = ?
        GROUP BY artist_name
        ORDER BY play_count DESC
        LIMIT 10
      `;
      
      const topArtists = await this.getAllQuery(topArtistsQuery, [userId]);

      return { 
        success: true, 
        analytics: {
          ...result,
          top_artists: topArtists
        }
      };
    } catch (error) {
      console.error('Get analytics error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save chat message
   */
  async saveChatMessage(sessionId, message, sender, userId = null, provider = null) {
    try {
      const query = `
        INSERT INTO chat_history 
        (user_id, session_id, message, sender, provider)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      await this.runQuery(query, [userId, sessionId, message, sender, provider]);
      return { success: true };
    } catch (error) {
      console.error('Save chat message error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check database health
   */
  async healthCheck() {
    try {
      if (!this.connected) {
        return { status: 'disconnected' };
      }

      // Simple query to test connection
      await this.getQuery('SELECT 1');
      
      return { 
        status: 'healthy',
        type: 'sqlite',
        path: this.dbPath,
        initialized: this.initialized
      };
    } catch (error) {
      return { 
        status: 'error', 
        error: error.message 
      };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('SQLite close error:', err.message);
        } else {
          console.log('SQLite database connection closed');
        }
      });
      this.connected = false;
    }
  }
}

module.exports = SQLiteManager;