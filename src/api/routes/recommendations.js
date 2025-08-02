const express = require('express');
const recommendationEngine = require('../../ml/recommendation-engine');
const { requireAuth, createRateLimit } = require('../middleware');

const router = express.Router();

// Rate limiting for recommendation endpoints
const recommendationRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window per IP
  message: 'Too many recommendation requests, please slow down'
});

/**
 * Get personalized recommendations
 * POST /api/recommendations/generate
 */
router.post('/generate', requireAuth, recommendationRateLimit, async (req, res) => {
  try {
    const {
      limit = 20,
      context,
      mood,
      activity,
      timeOfDay,
      includeNewMusic = true,
      excludeRecentlyPlayed = true
    } = req.body;

    const recommendations = await recommendationEngine.generateRecommendations(req.userId, {
      limit,
      context,
      mood,
      activity,
      timeOfDay,
      includeNewMusic,
      excludeRecentlyPlayed
    });

    res.json({
      success: true,
      ...recommendations,
      userId: req.userId,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: error.message
    });
  }
});

/**
 * Get recommendations based on mood
 * GET /api/recommendations/mood/:mood
 */
router.get('/mood/:mood', requireAuth, recommendationRateLimit, async (req, res) => {
  try {
    const { mood } = req.params;
    const { limit = 20 } = req.query;

    const validMoods = ['happy', 'sad', 'energetic', 'calm', 'upbeat', 'melancholy', 'focused', 'party'];
    if (!validMoods.includes(mood.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid mood',
        message: `Mood must be one of: ${validMoods.join(', ')}`
      });
    }

    const recommendations = await recommendationEngine.generateRecommendations(req.userId, {
      limit: parseInt(limit),
      mood: mood.toLowerCase()
    });

    res.json({
      success: true,
      mood: mood.toLowerCase(),
      ...recommendations
    });

  } catch (error) {
    console.error('Error getting mood recommendations:', error);
    res.status(500).json({
      error: 'Failed to get mood recommendations',
      message: error.message
    });
  }
});

/**
 * Get recommendations based on activity
 * GET /api/recommendations/activity/:activity
 */
router.get('/activity/:activity', requireAuth, recommendationRateLimit, async (req, res) => {
  try {
    const { activity } = req.params;
    const { limit = 20 } = req.query;

    const validActivities = ['workout', 'study', 'party', 'relaxation', 'commute', 'work', 'sleep'];
    if (!validActivities.includes(activity.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid activity',
        message: `Activity must be one of: ${validActivities.join(', ')}`
      });
    }

    const recommendations = await recommendationEngine.generateRecommendations(req.userId, {
      limit: parseInt(limit),
      activity: activity.toLowerCase()
    });

    res.json({
      success: true,
      activity: activity.toLowerCase(),
      ...recommendations
    });

  } catch (error) {
    console.error('Error getting activity recommendations:', error);
    res.status(500).json({
      error: 'Failed to get activity recommendations',
      message: error.message
    });
  }
});

/**
 * Get similar tracks to a given track
 * POST /api/recommendations/similar
 */
router.post('/similar', requireAuth, recommendationRateLimit, async (req, res) => {
  try {
    const { trackId, limit = 10 } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: 'Missing track ID',
        message: 'trackId is required'
      });
    }

    const similarTracks = await recommendationEngine.contentFilter.findSimilarTracks(trackId, {
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      seedTrack: trackId,
      similarTracks,
      count: similarTracks.length
    });

  } catch (error) {
    console.error('Error finding similar tracks:', error);
    res.status(500).json({
      error: 'Failed to find similar tracks',
      message: error.message
    });
  }
});

/**
 * Get user's recommendation history
 * GET /api/recommendations/history
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const db = require('../../database/mongodb').getDb();
    const recommendationsCollection = db.collection('recommendations');

    const [recommendations, total] = await Promise.all([
      recommendationsCollection
        .find({ user_id: req.userId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      recommendationsCollection.countDocuments({ user_id: req.userId })
    ]);

    res.json({
      success: true,
      recommendations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error getting recommendation history:', error);
    res.status(500).json({
      error: 'Failed to get recommendation history',
      message: error.message
    });
  }
});

/**
 * Provide feedback on recommendations
 * POST /api/recommendations/feedback
 */
router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const { recommendationId, trackId, feedback, rating } = req.body;

    if (!recommendationId || !trackId || (!feedback && !rating)) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'recommendationId, trackId, and either feedback or rating are required'
      });
    }

    const validFeedback = ['like', 'dislike', 'save', 'skip'];
    if (feedback && !validFeedback.includes(feedback)) {
      return res.status(400).json({
        error: 'Invalid feedback',
        message: `Feedback must be one of: ${validFeedback.join(', ')}`
      });
    }

    const db = require('../../database/mongodb').getDb();
    const recommendationsCollection = db.collection('recommendations');

    // Update recommendation with feedback
    const updateData = {
      [`user_feedback.${trackId}`]: {
        feedback: feedback || null,
        rating: rating || null,
        timestamp: new Date()
      },
      updated_at: new Date()
    };

    await recommendationsCollection.updateOne(
      { _id: recommendationId, user_id: req.userId },
      { $set: updateData }
    );

    // Update recommendation engine weights based on feedback
    if (feedback === 'like' || rating > 3) {
      // Positive feedback - could adjust algorithm weights
      console.log(`Positive feedback for track ${trackId} in recommendation ${recommendationId}`);
    }

    res.json({
      success: true,
      message: 'Feedback recorded successfully',
      feedbackData: updateData[`user_feedback.${trackId}`]
    });

  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({
      error: 'Failed to record feedback',
      message: error.message
    });
  }
});

/**
 * Get trending/popular recommendations
 * GET /api/recommendations/trending
 */
router.get('/trending', recommendationRateLimit, async (req, res) => {
  try {
    const { limit = 20, genre, timeframe = 'week' } = req.query;

    const recommendations = await recommendationEngine.generatePopularRecommendations(
      parseInt(limit),
      {
        genre,
        timeframe
      }
    );

    res.json({
      success: true,
      type: 'trending',
      timeframe,
      genre: genre || 'all',
      recommendations,
      count: recommendations.length
    });

  } catch (error) {
    console.error('Error getting trending recommendations:', error);
    res.status(500).json({
      error: 'Failed to get trending recommendations',
      message: error.message
    });
  }
});

/**
 * Get personalized playlist recommendations
 * POST /api/recommendations/playlist
 */
router.post('/playlist', requireAuth, recommendationRateLimit, async (req, res) => {
  try {
    const {
      playlistName,
      trackCount = 30,
      mood,
      activity,
      genres,
      audioFeatures
    } = req.body;

    if (!playlistName) {
      return res.status(400).json({
        error: 'Missing playlist name',
        message: 'playlistName is required'
      });
    }

    const recommendations = await recommendationEngine.generateRecommendations(req.userId, {
      limit: trackCount,
      mood,
      activity,
      genres,
      audioFeatures
    });

    const playlistData = {
      name: playlistName,
      description: `Personalized playlist generated by EchoTune AI${mood ? ` for ${mood} mood` : ''}${activity ? ` for ${activity}` : ''}`,
      tracks: recommendations.recommendations,
      metadata: recommendations.metadata,
      createdAt: new Date().toISOString()
    };

    res.json({
      success: true,
      playlist: playlistData,
      trackCount: recommendations.recommendations.length
    });

  } catch (error) {
    console.error('Error generating playlist recommendations:', error);
    res.status(500).json({
      error: 'Failed to generate playlist recommendations',
      message: error.message
    });
  }
});

/**
 * Get recommendation algorithm insights
 * GET /api/recommendations/insights
 */
router.get('/insights', requireAuth, async (req, res) => {
  try {
    const db = require('../../database/mongodb').getDb();
    
    // Get user's recent recommendations for analysis
    const recommendationsCollection = db.collection('recommendations');
    const recentRecommendations = await recommendationsCollection
      .find({ user_id: req.userId })
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    // Calculate algorithm performance
    const insights = {
      totalRecommendations: recentRecommendations.length,
      algorithmBreakdown: {
        contentBased: recentRecommendations.filter(r => r.recommendation_type === 'content_based').length,
        collaborative: recentRecommendations.filter(r => r.recommendation_type === 'collaborative').length,
        hybrid: recentRecommendations.filter(r => r.recommendation_type === 'hybrid').length
      },
      averageConfidence: recentRecommendations.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / recentRecommendations.length || 0,
      feedbackStats: {
        liked: 0,
        disliked: 0,
        saved: 0
      }
    };

    // Count feedback
    recentRecommendations.forEach(rec => {
      if (rec.user_feedback) {
        Object.values(rec.user_feedback).forEach(feedback => {
          if (feedback.feedback === 'like') insights.feedbackStats.liked++;
          if (feedback.feedback === 'dislike') insights.feedbackStats.disliked++;
          if (feedback.feedback === 'save') insights.feedbackStats.saved++;
        });
      }
    });

    res.json({
      success: true,
      insights,
      recommendations: recentRecommendations.map(r => ({
        id: r._id,
        type: r.recommendation_type,
        confidence: r.confidence_score,
        createdAt: r.created_at,
        trackCount: r.tracks?.length || 0
      }))
    });

  } catch (error) {
    console.error('Error getting recommendation insights:', error);
    res.status(500).json({
      error: 'Failed to get recommendation insights',
      message: error.message
    });
  }
});

module.exports = router;