const express = require('express');
const router = express.Router();
const databaseManager = require('../../database/database-manager');

/**
 * Database API Routes
 * Provides endpoints for database operations and status monitoring
 */

/**
 * Get database connection status
 */
router.get('/status', async (req, res) => {
  try {
    const healthStatus = await databaseManager.healthCheck();
    
    res.json({
      success: true,
      ...healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check database status',
      details: error.message
    });
  }
});

/**
 * Initialize fallback database (SQLite)
 */
router.post('/init-fallback', async (req, res) => {
  try {
    if (!databaseManager.sqlite) {
      const SQLiteManager = require('../../database/sqlite-manager');
      databaseManager.sqlite = new SQLiteManager();
    }

    const success = await databaseManager.sqlite.initialize();
    
    if (success) {
      databaseManager.activeDatabases = ['sqlite'];
      databaseManager.fallbackMode = true;
      
      res.json({
        success: true,
        message: 'Fallback database initialized successfully',
        database: 'sqlite'
      });
    } else {
      throw new Error('SQLite initialization failed');
    }
  } catch (error) {
    console.error('Fallback database initialization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize fallback database',
      details: error.message
    });
  }
});

/**
 * Save user data
 */
router.post('/user', async (req, res) => {
  try {
    const userData = req.body;
    
    if (!userData.id) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const result = await databaseManager.saveUser(userData);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'User data saved successfully',
        primary: result.primary,
        results: result.results
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save user data',
        results: result.results
      });
    }
  } catch (error) {
    console.error('Save user data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save user data',
      details: error.message
    });
  }
});

/**
 * Save listening history
 */
router.post('/listening-history', async (req, res) => {
  try {
    const { userId, tracks } = req.body;
    
    if (!userId || !tracks || !Array.isArray(tracks)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and tracks array are required'
      });
    }

    const result = await databaseManager.saveListeningHistory(userId, tracks);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Listening history saved successfully',
        results: result.results
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save listening history',
        results: result.results
      });
    }
  } catch (error) {
    console.error('Save listening history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save listening history',
      details: error.message
    });
  }
});

/**
 * Get recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { userId, limit } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const options = {
      limit: parseInt(limit) || 20
    };

    const result = await databaseManager.getRecommendations(userId, options);
    
    if (result.success) {
      res.json({
        success: true,
        recommendations: result.recommendations,
        source: result.source,
        count: result.recommendations.length
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No recommendations found',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      details: error.message
    });
  }
});

/**
 * Get analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const { userId, dateFrom, dateTo } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const options = {};
    if (dateFrom) options.dateFrom = dateFrom;
    if (dateTo) options.dateTo = dateTo;

    const result = await databaseManager.getAnalytics(userId, options);
    
    if (result.success) {
      res.json({
        success: true,
        analytics: result.analytics,
        source: result.source
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No analytics data found',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      details: error.message
    });
  }
});

/**
 * Get database info
 */
router.get('/info', async (req, res) => {
  try {
    const info = databaseManager.getActiveDatabase();
    
    res.json({
      success: true,
      ...info,
      initialized: databaseManager.initialized
    });
  } catch (error) {
    console.error('Get database info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database info',
      details: error.message
    });
  }
});

/**
 * Test database connectivity
 */
router.post('/test', async (req, res) => {
  try {
    const { database } = req.body;
    
    if (database && !['mongodb', 'supabase', 'sqlite'].includes(database)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid database type'
      });
    }

    const healthStatus = await databaseManager.healthCheck();
    
    if (database) {
      const dbStatus = healthStatus.connections[database];
      res.json({
        success: dbStatus.connected,
        database,
        status: dbStatus
      });
    } else {
      res.json({
        success: healthStatus.healthy,
        ...healthStatus
      });
    }
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      error: 'Database test failed',
      details: error.message
    });
  }
});

module.exports = router;