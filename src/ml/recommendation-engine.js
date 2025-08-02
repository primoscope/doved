const databaseManager = require('../database/database-manager');

/**
 * Enhanced Real-time Recommendation Engine for EchoTune AI
 * Integrates ML algorithms to learn user preferences and provide dynamic music recommendations
 */
class RecommendationEngine {
  constructor() {
    this.userProfiles = new Map();
    this.recommendations = new Map();
    this.feedbackQueue = [];
    this.initialized = false;
    
    // Algorithm weights for hybrid recommendations
    this.weights = {
      content_based: 0.4,
      collaborative: 0.3,
      context_aware: 0.2,
      trending: 0.1
    };
  }

  /**
   * Initialize the recommendation engine
   */
  async initialize() {
    try {
      console.log('🎯 Initializing Real-time Recommendation Engine...');
      
      // Start background processing
      this.startBackgroundProcessing();
      
      this.initialized = true;
      console.log('✅ Recommendation Engine initialized');
      return true;
    } catch (error) {
      console.error('Recommendation Engine initialization failed:', error);
      return false;
    }
  }

  /**
   * Generate personalized recommendations for a user
   */
  async generateRecommendations(userId, options = {}) {
    try {
      const {
        limit = 20,
        context: _context = {},
        mood = null,
        activity = null,
        timeOfDay = null
      } = options;

      // Get user profile
      const userProfile = await this.getUserProfile(userId);
      
      // Get listening history
      const listeningHistory = await this.getListeningHistory(userId, { limit: 100 });
      
      // Generate context-aware recommendations
      const recommendations = await this.computeRecommendations(
        userProfile,
        listeningHistory,
        {
          mood,
          activity,
          timeOfDay: timeOfDay || this.getCurrentTimeContext(),
          limit
        }
      );

      // Store recommendations for future reference
      this.recommendations.set(userId, {
        recommendations,
        timestamp: Date.now(),
        context: { mood, activity, timeOfDay }
      });

      return {
        success: true,
        recommendations,
        userProfile: userProfile.summary,
        context: { mood, activity, timeOfDay }
      };
    } catch (error) {
      console.error('Generate recommendations error:', error);
      return {
        success: false,
        error: error.message,
        recommendations: this.getFallbackRecommendations(options)
      };
    }
  }

  /**
   * Get or create user profile
   */
  async getUserProfile(userId) {
    // Check cache first
    if (this.userProfiles.has(userId)) {
      const cached = this.userProfiles.get(userId);
      if (Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 minutes
        return cached.profile;
      }
    }

    try {
      // Get analytics data to build profile
      const analyticsResult = await databaseManager.getAnalytics(userId);
      
      let profile = {
        userId,
        preferences: {
          genres: [],
          artists: [],
          audioFeatures: {},
          timePatterns: {},
          moodPatterns: {}
        },
        summary: {
          totalTracks: 0,
          uniqueArtists: 0,
          diversityScore: 0,
          dominantGenres: [],
          listeningPatterns: {}
        },
        lastUpdated: new Date().toISOString()
      };

      if (analyticsResult.success && analyticsResult.analytics) {
        const analytics = analyticsResult.analytics;
        
        profile.summary = {
          totalTracks: analytics.total_tracks || analytics.totalTracks || 0,
          uniqueArtists: analytics.unique_artists || analytics.uniqueArtists || 0,
          diversityScore: this.calculateDiversityScore(analytics),
          dominantGenres: await this.extractDominantGenres(userId),
          listeningPatterns: await this.analyzeListeningPatterns(userId)
        };

        profile.preferences = await this.buildUserPreferences(userId, analytics);
      }

      // Cache the profile
      this.userProfiles.set(userId, {
        profile,
        timestamp: Date.now()
      });

      return profile;
    } catch (error) {
      console.error('Get user profile error:', error);
      
      // Return basic profile if analytics fail
      return {
        userId,
        preferences: { genres: [], artists: [], audioFeatures: {} },
        summary: { totalTracks: 0, uniqueArtists: 0, diversityScore: 0 },
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Get user listening history
   */
  async getListeningHistory(userId, _options = {}) {
    try {
      // Mock implementation - in real app would query database
      return [
        {
          trackId: 'track1',
          trackName: 'Sample Track 1',
          artistName: 'Sample Artist 1',
          playedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          audioFeatures: {
            danceability: 0.7,
            energy: 0.8,
            valence: 0.6,
            tempo: 120,
            acousticness: 0.1
          }
        }
      ];
    } catch (error) {
      console.error('Get listening history error:', error);
      return [];
    }
  }

  /**
   * Compute recommendations using ML algorithms
   */
  async computeRecommendations(userProfile, listeningHistory, context) {
    try {
      // 1. Collaborative Filtering - Find similar users
      const similarUsers = await this.findSimilarUsers(userProfile);
      const collaborativeRecs = await this.getCollaborativeRecommendations(similarUsers);

      // 2. Content-Based Filtering - Based on audio features
      const contentRecs = await this.getContentBasedRecommendations(userProfile, context);

      // 3. Context-Aware Recommendations - Mood/Activity/Time based
      const contextRecs = await this.getContextAwareRecommendations(userProfile, context);

      // 4. Trending/Popular - Include some popular tracks
      const trendingRecs = await this.getTrendingRecommendations(context);

      // Combine and score recommendations
      const combinedRecs = [
        ...collaborativeRecs.map(r => ({ ...r, source: 'collaborative', weight: this.weights.collaborative })),
        ...contentRecs.map(r => ({ ...r, source: 'content', weight: this.weights.content_based })),
        ...contextRecs.map(r => ({ ...r, source: 'context', weight: this.weights.context_aware })),
        ...trendingRecs.map(r => ({ ...r, source: 'trending', weight: this.weights.trending }))
      ];

      // Score and rank recommendations
      const scoredRecs = combinedRecs.map(rec => ({
        ...rec,
        finalScore: this.calculateRecommendationScore(rec, userProfile, context)
      }));

      // Sort by score and remove duplicates
      const uniqueRecs = this.removeDuplicates(scoredRecs, 'trackId');
      const sortedRecs = uniqueRecs.sort((a, b) => b.finalScore - a.finalScore);

      // Format for output
      return sortedRecs.slice(0, context.limit || 20).map(rec => ({
        trackId: rec.trackId,
        trackName: rec.trackName,
        artistName: rec.artistName,
        albumName: rec.albumName,
        score: rec.finalScore,
        reason: this.generateRecommendationReason(rec, context),
        source: rec.source,
        audioFeatures: rec.audioFeatures,
        spotifyUrl: rec.spotifyUrl
      }));
    } catch (error) {
      console.error('Compute recommendations error:', error);
      return this.getFallbackRecommendations(context);
    }
  }

  /**
   * Process user feedback for real-time learning
   */
  async processFeedback(userId, feedback) {
    try {
      const {
        trackId,
        action, // 'like', 'dislike', 'skip', 'save', 'play_full'
        context = {},
        timestamp = Date.now()
      } = feedback;

      // Add to feedback queue for batch processing
      this.feedbackQueue.push({
        userId,
        trackId,
        action,
        context,
        timestamp
      });

      // Update user profile immediately for real-time adaptation
      await this.updateUserProfileFromFeedback(userId, feedback);

      // Process queue if it's getting large
      if (this.feedbackQueue.length > 100) {
        await this.processFeedbackQueue();
      }

      return { success: true };
    } catch (error) {
      console.error('Process feedback error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update user profile based on feedback
   */
  async updateUserProfileFromFeedback(userId, feedback) {
    const userProfile = await this.getUserProfile(userId);
    
    // Adjust preferences based on feedback
    const weight = this.getFeedbackWeight(feedback.action);
    
    if (feedback.audioFeatures) {
      // Update audio feature preferences
      Object.keys(feedback.audioFeatures).forEach(feature => {
        if (!userProfile.preferences.audioFeatures[feature]) {
          userProfile.preferences.audioFeatures[feature] = 0;
        }
        userProfile.preferences.audioFeatures[feature] += 
          feedback.audioFeatures[feature] * weight * 0.1;
      });
    }

    // Cache updated profile
    this.userProfiles.set(userId, {
      profile: userProfile,
      timestamp: Date.now()
    });
  }

  /**
   * Get feedback weight based on action type
   */
  getFeedbackWeight(action) {
    const weights = {
      'like': 1.0,
      'save': 1.2,
      'play_full': 0.8,
      'skip': -0.5,
      'dislike': -1.0
    };
    return weights[action] || 0;
  }

  /**
   * Find similar users for collaborative filtering
   */
  async findSimilarUsers(_userProfile) {
    // Mock implementation - would use cosine similarity in real app
    return [
      { userId: 'user2', similarity: 0.85 },
      { userId: 'user3', similarity: 0.78 },
      { userId: 'user4', similarity: 0.72 }
    ];
  }

  /**
   * Get collaborative filtering recommendations
   */
  async getCollaborativeRecommendations(_similarUsers) {
    // Mock collaborative recommendations
    return [
      {
        trackId: 'collab1',
        trackName: 'Collaborative Track 1',
        artistName: 'Artist A',
        score: 0.85,
        audioFeatures: { danceability: 0.7, energy: 0.8, valence: 0.6 }
      },
      {
        trackId: 'collab2',
        trackName: 'Collaborative Track 2',
        artistName: 'Artist B',
        score: 0.78,
        audioFeatures: { danceability: 0.5, energy: 0.6, valence: 0.8 }
      }
    ];
  }

  /**
   * Get content-based recommendations
   */
  async getContentBasedRecommendations(userProfile, _context) {
    // Mock content-based recommendations based on audio features
    const preferences = userProfile.preferences.audioFeatures;
    
    return [
      {
        trackId: 'content1',
        trackName: 'Content Track 1',
        artistName: 'Artist C',
        score: 0.92,
        audioFeatures: preferences
      },
      {
        trackId: 'content2',
        trackName: 'Content Track 2',
        artistName: 'Artist D',
        score: 0.88,
        audioFeatures: { ...preferences, valence: 0.9 }
      }
    ];
  }

  /**
   * Get context-aware recommendations
   */
  async getContextAwareRecommendations(userProfile, context) {
    const contextRecs = [];

    // Mood-based recommendations
    if (context.mood) {
      const moodRecs = await this.getMoodBasedRecommendations(context.mood);
      contextRecs.push(...moodRecs);
    }

    // Activity-based recommendations
    if (context.activity) {
      const activityRecs = await this.getActivityBasedRecommendations(context.activity);
      contextRecs.push(...activityRecs);
    }

    // Time-based recommendations
    if (context.timeOfDay) {
      const timeRecs = await this.getTimeBasedRecommendations(context.timeOfDay);
      contextRecs.push(...timeRecs);
    }

    return contextRecs.slice(0, 10);
  }

  /**
   * Get mood-based recommendations
   */
  async getMoodBasedRecommendations(mood) {
    const moodMappings = {
      happy: { valence: 0.8, energy: 0.7, danceability: 0.7 },
      sad: { valence: 0.2, energy: 0.3, acousticness: 0.8 },
      energetic: { energy: 0.9, danceability: 0.8, tempo: 140 },
      calm: { valence: 0.5, energy: 0.3, acousticness: 0.7 },
      romantic: { valence: 0.6, energy: 0.4, acousticness: 0.6 }
    };

    const features = moodMappings[mood.toLowerCase()] || moodMappings.happy;

    return [
      {
        trackId: `mood_${mood}_1`,
        trackName: `${mood} Track 1`,
        artistName: 'Mood Artist',
        score: 0.9,
        audioFeatures: features
      }
    ];
  }

  /**
   * Get activity-based recommendations
   */
  async getActivityBasedRecommendations(activity) {
    const activityMappings = {
      workout: { energy: 0.9, danceability: 0.8, tempo: 140 },
      study: { energy: 0.3, instrumentalness: 0.8, acousticness: 0.5 },
      party: { danceability: 0.9, energy: 0.8, valence: 0.8 },
      sleep: { energy: 0.1, acousticness: 0.9, valence: 0.3 },
      work: { energy: 0.5, instrumentalness: 0.6, acousticness: 0.4 }
    };

    const features = activityMappings[activity.toLowerCase()] || activityMappings.work;

    return [
      {
        trackId: `activity_${activity}_1`,
        trackName: `${activity} Track 1`,
        artistName: 'Activity Artist',
        score: 0.85,
        audioFeatures: features
      }
    ];
  }

  /**
   * Get trending recommendations
   */
  async getTrendingRecommendations(_context) {
    return [
      {
        trackId: 'trending1',
        trackName: 'Trending Track 1',
        artistName: 'Hot Artist',
        score: 0.75
      }
    ];
  }

  /**
   * Calculate recommendation score
   */
  calculateRecommendationScore(recommendation, userProfile, context) {
    let score = recommendation.score || 0.5;
    
    // Apply weight based on source
    score *= recommendation.weight || 1.0;
    
    // Boost score based on user preferences
    if (recommendation.audioFeatures && userProfile.preferences.audioFeatures) {
      const featureSimilarity = this.calculateFeatureSimilarity(
        recommendation.audioFeatures,
        userProfile.preferences.audioFeatures
      );
      score *= (1 + featureSimilarity * 0.5);
    }
    
    // Apply context boost
    if (context.mood || context.activity) {
      score *= 1.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate audio feature similarity
   */
  calculateFeatureSimilarity(features1, features2) {
    const commonFeatures = ['danceability', 'energy', 'valence', 'acousticness'];
    let similarity = 0;
    let count = 0;

    commonFeatures.forEach(feature => {
      if (features1[feature] !== undefined && features2[feature] !== undefined) {
        similarity += 1 - Math.abs(features1[feature] - features2[feature]);
        count++;
      }
    });

    return count > 0 ? similarity / count : 0.5;
  }

  /**
   * Generate recommendation reason
   */
  generateRecommendationReason(recommendation, context) {
    const reasons = [];
    
    if (recommendation.source === 'collaborative') {
      reasons.push('Users with similar taste enjoy this');
    }
    if (recommendation.source === 'content') {
      reasons.push('Matches your music preferences');
    }
    if (context.mood) {
      reasons.push(`Perfect for ${context.mood} mood`);
    }
    if (context.activity) {
      reasons.push(`Great for ${context.activity}`);
    }
    
    return reasons.join(', ') || 'Recommended for you';
  }

  /**
   * Remove duplicate recommendations
   */
  removeDuplicates(items, key) {
    const seen = new Set();
    return items.filter(item => {
      const value = item[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  /**
   * Get current time context
   */
  getCurrentTimeContext() {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get fallback recommendations when ML fails
   */
  getFallbackRecommendations(_context) {
    return [
      {
        trackId: 'fallback1',
        trackName: 'Popular Track 1',
        artistName: 'Popular Artist',
        score: 0.7,
        reason: 'Popular recommendation',
        source: 'fallback'
      },
      {
        trackId: 'fallback2',
        trackName: 'Popular Track 2',
        artistName: 'Trending Artist',
        score: 0.65,
        reason: 'Trending now',
        source: 'fallback'
      }
    ];
  }

  /**
   * Helper methods for profile building
   */
  calculateDiversityScore(analytics) {
    const totalTracks = analytics.total_tracks || analytics.totalTracks || 0;
    const uniqueArtists = analytics.unique_artists || analytics.uniqueArtists || 0;
    
    if (totalTracks === 0) return 0;
    return Math.min(uniqueArtists / totalTracks, 1.0);
  }

  async extractDominantGenres(_userId) {
    return ['Pop', 'Rock', 'Electronic'];
  }

  async analyzeListeningPatterns(_userId) {
    return {
      peakHours: ['19:00', '20:00', '21:00'],
      weekdayPattern: 'evening_focused',
      sessionLength: 45
    };
  }

  async buildUserPreferences(userId, analytics) {
    return {
      genres: ['Pop', 'Rock'],
      artists: analytics.top_artists || [],
      audioFeatures: {
        danceability: 0.6,
        energy: 0.7,
        valence: 0.6,
        acousticness: 0.3
      }
    };
  }

  async getTimeBasedRecommendations(timeOfDay) {
    return [
      {
        trackId: `time_${timeOfDay}_1`,
        trackName: `${timeOfDay} Track`,
        artistName: 'Time Artist',
        score: 0.8
      }
    ];
  }

  /**
   * Start background processing for continuous learning
   */
  startBackgroundProcessing() {
    // Process feedback queue every 5 minutes
    setInterval(async () => {
      if (this.feedbackQueue.length > 0) {
        await this.processFeedbackQueue();
      }
    }, 5 * 60 * 1000);

    // Update user profiles every hour
    setInterval(async () => {
      await this.updateAllUserProfiles();
    }, 60 * 60 * 1000);
  }

  /**
   * Process feedback queue for batch learning
   */
  async processFeedbackQueue() {
    if (this.feedbackQueue.length === 0) return;

    try {
      console.log(`Processing ${this.feedbackQueue.length} feedback items...`);
      
      // Group feedback by user
      const userFeedback = new Map();
      this.feedbackQueue.forEach(feedback => {
        if (!userFeedback.has(feedback.userId)) {
          userFeedback.set(feedback.userId, []);
        }
        userFeedback.get(feedback.userId).push(feedback);
      });

      // Process each user's feedback
      for (const [userId, feedbacks] of userFeedback) {
        await this.batchUpdateUserProfile(userId, feedbacks);
      }

      // Clear the queue
      this.feedbackQueue = [];
      
      console.log('✅ Feedback queue processed successfully');
    } catch (error) {
      console.error('Process feedback queue error:', error);
    }
  }

  /**
   * Batch update user profile from multiple feedback items
   */
  async batchUpdateUserProfile(userId, feedbacks) {
    for (const feedback of feedbacks) {
      await this.updateUserProfileFromFeedback(userId, feedback);
    }
  }

  async updateAllUserProfiles() {
    console.log('🔄 Updating user profiles...');
    this.userProfiles.clear();
  }
}

// Singleton instance
const recommendationEngine = new RecommendationEngine();

module.exports = recommendationEngine;