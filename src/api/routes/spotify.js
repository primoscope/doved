const express = require('express');
const SpotifyAudioFeaturesService = require('../../spotify/audio-features');
const { requireAuth, createRateLimit } = require('../middleware');

const router = express.Router();
const spotifyService = new SpotifyAudioFeaturesService();

// Rate limiting for Spotify endpoints
const spotifyRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for data processing
  message: 'Too many Spotify API requests, please slow down'
});

/**
 * Get audio features for a track
 * GET /api/spotify/audio-features/:trackId
 */
router.get('/audio-features/:trackId', requireAuth, spotifyRateLimit, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Missing access token',
        message: 'Spotify access token is required'
      });
    }

    const audioFeatures = await spotifyService.getAudioFeatures(trackId, accessToken);

    res.json({
      success: true,
      trackId,
      audioFeatures
    });

  } catch (error) {
    console.error('Error getting audio features:', error);
    res.status(500).json({
      error: 'Failed to get audio features',
      message: error.message
    });
  }
});

/**
 * Get audio features for multiple tracks
 * POST /api/spotify/audio-features/batch
 */
router.post('/audio-features/batch', requireAuth, spotifyRateLimit, async (req, res) => {
  try {
    const { trackIds, accessToken } = req.body;

    if (!accessToken || !trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'accessToken and trackIds array are required'
      });
    }

    if (trackIds.length > 100) {
      return res.status(400).json({
        error: 'Too many tracks',
        message: 'Maximum 100 tracks per batch request'
      });
    }

    const result = await spotifyService.getBatchAudioFeatures(trackIds, accessToken, {
      onProgress: (progress) => {
        // Could emit progress via WebSocket in real-time applications
        console.log(`Progress: ${progress.processed}/${progress.total}`);
      }
    });

    res.json({
      success: true,
      result,
      processedCount: result.totalProcessed,
      errorCount: result.errors.length
    });

  } catch (error) {
    console.error('Error getting batch audio features:', error);
    res.status(500).json({
      error: 'Failed to get batch audio features',
      message: error.message
    });
  }
});

/**
 * Get track metadata
 * GET /api/spotify/track/:trackId
 */
router.get('/track/:trackId', requireAuth, spotifyRateLimit, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Missing access token',
        message: 'Spotify access token is required'
      });
    }

    const metadata = await spotifyService.getTrackMetadata(trackId, accessToken);

    res.json({
      success: true,
      trackId,
      metadata
    });

  } catch (error) {
    console.error('Error getting track metadata:', error);
    res.status(500).json({
      error: 'Failed to get track metadata',
      message: error.message
    });
  }
});

/**
 * Get metadata for multiple tracks
 * POST /api/spotify/tracks/batch
 */
router.post('/tracks/batch', requireAuth, spotifyRateLimit, async (req, res) => {
  try {
    const { trackIds, accessToken } = req.body;

    if (!accessToken || !trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'accessToken and trackIds array are required'
      });
    }

    if (trackIds.length > 50) {
      return res.status(400).json({
        error: 'Too many tracks',
        message: 'Maximum 50 tracks per batch request'
      });
    }

    const metadata = await spotifyService.getBatchTrackMetadata(trackIds, accessToken);

    res.json({
      success: true,
      tracks: metadata,
      count: metadata.length
    });

  } catch (error) {
    console.error('Error getting batch track metadata:', error);
    res.status(500).json({
      error: 'Failed to get batch track metadata',
      message: error.message
    });
  }
});

/**
 * Process CSV listening history with audio features
 * POST /api/spotify/process-history
 */
router.post('/process-history', requireAuth, spotifyRateLimit, async (req, res) => {
  try {
    const { listeningHistory, accessToken, includeMetadata = true } = req.body;

    if (!accessToken || !listeningHistory || !Array.isArray(listeningHistory)) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'accessToken and listeningHistory array are required'
      });
    }

    if (listeningHistory.length > 1000) {
      return res.status(400).json({
        error: 'Too much data',
        message: 'Maximum 1000 listening history items per request. Consider breaking into smaller batches.'
      });
    }

    const enrichedHistory = await spotifyService.enrichListeningHistory(
      listeningHistory,
      accessToken,
      {
        includeMetadata,
        onProgress: (progress) => {
          console.log(`Processing: ${progress.stage} - ${progress.processed}/${progress.total}`);
        }
      }
    );

    // Store enriched data in database
    const db = require('../../database/mongodb').getDb();
    const listeningHistoryCollection = db.collection('listening_history');

    const operations = enrichedHistory.map(item => ({
      updateOne: {
        filter: {
          user_id: req.userId,
          track_id: item.track_id,
          played_at: item.played_at
        },
        update: { $set: { ...item, user_id: req.userId } },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await listeningHistoryCollection.bulkWrite(operations);
    }

    res.json({
      success: true,
      processedItems: enrichedHistory.length,
      enrichedHistory: enrichedHistory.slice(0, 10), // Return first 10 for preview
      message: 'Listening history processed and stored successfully'
    });

  } catch (error) {
    console.error('Error processing listening history:', error);
    res.status(500).json({
      error: 'Failed to process listening history',
      message: error.message
    });
  }
});

/**
 * Get cached audio features
 * POST /api/spotify/cached-features
 */
router.post('/cached-features', requireAuth, async (req, res) => {
  try {
    const { trackIds } = req.body;

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        error: 'Missing trackIds',
        message: 'trackIds array is required'
      });
    }

    const cachedFeatures = await spotifyService.getCachedAudioFeatures(trackIds);

    res.json({
      success: true,
      cachedFeatures,
      count: cachedFeatures.length,
      cacheHitRate: cachedFeatures.length / trackIds.length
    });

  } catch (error) {
    console.error('Error getting cached features:', error);
    res.status(500).json({
      error: 'Failed to get cached features',
      message: error.message
    });
  }
});

/**
 * Get missing track IDs that need audio features
 * POST /api/spotify/missing-features
 */
router.post('/missing-features', requireAuth, async (req, res) => {
  try {
    const { trackIds } = req.body;

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        error: 'Missing trackIds',
        message: 'trackIds array is required'
      });
    }

    const missingTrackIds = await spotifyService.getMissingTrackIds(trackIds);

    res.json({
      success: true,
      missingTrackIds,
      missingCount: missingTrackIds.length,
      totalRequested: trackIds.length,
      cacheHitRate: (trackIds.length - missingTrackIds.length) / trackIds.length
    });

  } catch (error) {
    console.error('Error getting missing track IDs:', error);
    res.status(500).json({
      error: 'Failed to get missing track IDs',
      message: error.message
    });
  }
});

/**
 * Get Spotify service statistics
 * GET /api/spotify/stats
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const cacheStats = spotifyService.getCacheStats();
    
    // Get database statistics
    const db = require('../../database/mongodb').getDb();
    const [audioFeaturesCount, trackMetadataCount, listeningHistoryCount] = await Promise.all([
      db.collection('audio_features').countDocuments(),
      db.collection('track_metadata').countDocuments(),
      db.collection('listening_history').countDocuments({ user_id: req.userId })
    ]);

    res.json({
      success: true,
      stats: {
        cache: cacheStats,
        database: {
          audioFeatures: audioFeaturesCount,
          trackMetadata: trackMetadataCount,
          userListeningHistory: listeningHistoryCount
        },
        service: {
          name: 'SpotifyAudioFeaturesService',
          status: 'active'
        }
      }
    });

  } catch (error) {
    console.error('Error getting Spotify stats:', error);
    res.status(500).json({
      error: 'Failed to get Spotify statistics',
      message: error.message
    });
  }
});

/**
 * Clear service cache
 * POST /api/spotify/clear-cache
 */
router.post('/clear-cache', requireAuth, async (req, res) => {
  try {
    spotifyService.clearCache();

    res.json({
      success: true,
      message: 'Service cache cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * Upload and process CSV file
 * POST /api/spotify/upload-csv
 */
router.post('/upload-csv', requireAuth, async (req, res) => {
  try {
    const multer = require('multer');
    const csv = require('csv-parser');
    const fs = require('fs');
    const path = require('path');

    // Configure multer for file upload
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../../uploads/csv');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${req.userId}_${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
      }
    });

    const upload = multer({
      storage,
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
          cb(null, true);
        } else {
          cb(new Error('Only CSV files are allowed'));
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
      }
    }).single('csvFile');

    // Handle file upload
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          error: 'File upload failed',
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a CSV file to upload'
        });
      }

      const { accessToken, processAudioFeatures = true } = req.body;

      if (!accessToken) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: 'Missing access token',
          message: 'Spotify access token is required for processing'
        });
      }

      const csvData = [];
      const errors = [];
      let rowCount = 0;

      // Parse CSV file
      const parsePromise = new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', (row) => {
            rowCount++;
            
            // Validate required columns
            if (!row.track_id && !row.trackId && !row['Track ID']) {
              errors.push(`Row ${rowCount}: Missing track_id`);
              return;
            }

            // Normalize column names
            const normalizedRow = {
              track_id: row.track_id || row.trackId || row['Track ID'],
              track_name: row.track_name || row.trackName || row['Track Name'] || '',
              artist_name: row.artist_name || row.artistName || row['Artist Name'] || '',
              played_at: row.played_at || row.playedAt || row['Played At'] || new Date().toISOString(),
              duration_ms: parseInt(row.duration_ms || row.durationMs || row['Duration (ms)'] || 0),
              user_id: req.userId
            };

            // Validate track_id format (Spotify track IDs are 22 characters)
            if (normalizedRow.track_id.length !== 22) {
              errors.push(`Row ${rowCount}: Invalid track_id format`);
              return;
            }

            csvData.push(normalizedRow);
          })
          .on('end', resolve)
          .on('error', reject);
      });

      try {
        await parsePromise;

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (csvData.length === 0) {
          return res.status(400).json({
            error: 'No valid data found',
            message: 'CSV file contained no valid listening history records',
            errors: errors.slice(0, 10) // Return first 10 errors
          });
        }

        // Process audio features if requested
        let enrichedData = csvData;
        if (processAudioFeatures) {
          // uniqueTrackIds removed - was unused
          // Process in smaller batches to avoid overwhelming the API
          enrichedData = await spotifyService.enrichListeningHistory(
            csvData,
            accessToken,
            {
              includeMetadata: true,
              onProgress: (progress) => {
                console.log(`Processing CSV: ${progress.stage} - ${progress.processed}/${progress.total}`);
              }
            }
          );
        }

        // Store in database
        const db = require('../../database/mongodb').getDb();
        const listeningHistoryCollection = db.collection('listening_history');

        const operations = enrichedData.map(item => ({
          updateOne: {
            filter: {
              user_id: req.userId,
              track_id: item.track_id,
              played_at: item.played_at
            },
            update: { $set: item },
            upsert: true
          }
        }));

        const bulkResult = await listeningHistoryCollection.bulkWrite(operations);

        res.json({
          success: true,
          processed: {
            total_rows: rowCount,
            valid_records: csvData.length,
            stored_records: bulkResult.upsertedCount + bulkResult.modifiedCount,
            audio_features_processed: processAudioFeatures,
            errors_count: errors.length
          },
          errors: errors.slice(0, 5), // Return first 5 errors for debugging
          sample_data: enrichedData.slice(0, 3), // Return first 3 records as sample
          message: `Successfully processed ${csvData.length} listening history records from CSV file`
        });

      } catch (parseError) {
        // Clean up uploaded file on error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        console.error('Error parsing CSV:', parseError);
        res.status(500).json({
          error: 'CSV processing failed',
          message: parseError.message
        });
      }
    });

  } catch (error) {
    console.error('Error in CSV upload endpoint:', error);
    res.status(500).json({
      error: 'Failed to process CSV upload',
      message: error.message
    });
  }
});

/**
 * Health check for Spotify service
 * GET /api/spotify/health
 */
router.get('/health', async (req, res) => {
  try {
    const cacheStats = spotifyService.getCacheStats();
    
    res.json({
      status: 'healthy',
      service: 'SpotifyAudioFeaturesService',
      cache: cacheStats,
      rateLimiter: {
        status: 'active'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;