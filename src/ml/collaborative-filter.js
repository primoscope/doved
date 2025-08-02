const mongoManager = require('../database/mongodb');

/**
 * Collaborative Filtering for Music Recommendations
 * Uses user-item interactions to find similar users and recommend music
 */
class CollaborativeFilter {
  constructor() {
    this.similarityThreshold = 0.1;
    this.minCommonTracks = 5;
    this.maxSimilarUsers = 50;
  }

  /**
   * Get collaborative filtering recommendations for a user
   */
  async getRecommendations(userId, options = {}) {
    const { limit = 50 } = options;

    try {
      // Find similar users
      const similarUsers = await this.findSimilarUsers(userId);
      
      if (similarUsers.length === 0) {
        console.log('No similar users found for collaborative filtering');
        return [];
      }

      // Get recommendations from similar users
      const recommendations = await this.generateRecommendationsFromSimilarUsers(
        userId, 
        similarUsers, 
        { limit: limit * 2 }
      );

      return recommendations.slice(0, limit);

    } catch (error) {
      console.error('Error generating collaborative recommendations:', error);
      return [];
    }
  }

  /**
   * Find users similar to the target user based on listening history
   */
  async findSimilarUsers(userId) {
    try {
      const db = mongoManager.getDb();
      const listeningHistoryCollection = db.collection('listening_history');

      // Get target user's listening history
      const userTracks = await this.getUserTracks(userId);
      
      if (userTracks.length === 0) {
        return [];
      }

      // Find other users who listened to similar tracks
      const similarUserCandidates = await listeningHistoryCollection.aggregate([
        {
          $match: {
            track_id: { $in: userTracks },
            user_id: { $ne: userId }
          }
        },
        {
          $group: {
            _id: '$user_id',
            common_tracks: { $addToSet: '$track_id' },
            total_listens: { $sum: 1 }
          }
        },
        {
          $match: {
            $expr: { $gte: [{ $size: '$common_tracks' }, this.minCommonTracks] }
          }
        },
        {
          $limit: 200 // Limit candidates for performance
        }
      ]).toArray();

      // Calculate similarity scores
      const similarities = await Promise.all(
        similarUserCandidates.map(async candidate => {
          const similarity = await this.calculateUserSimilarity(
            userId, 
            candidate._id, 
            userTracks, 
            candidate.common_tracks
          );
          
          return {
            user_id: candidate._id,
            similarity_score: similarity,
            common_tracks: candidate.common_tracks.length,
            total_listens: candidate.total_listens
          };
        })
      );

      // Filter and sort by similarity
      return similarities
        .filter(s => s.similarity_score >= this.similarityThreshold)
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, this.maxSimilarUsers);

    } catch (error) {
      console.error('Error finding similar users:', error);
      return [];
    }
  }

  /**
   * Get user's track listening history
   */
  async getUserTracks(userId) {
    try {
      const db = mongoManager.getDb();
      const listeningHistoryCollection = db.collection('listening_history');

      const userHistory = await listeningHistoryCollection
        .find({ user_id: userId })
        .toArray();

      return [...new Set(userHistory.map(h => h.track_id))]; // Unique tracks
    } catch (error) {
      console.error('Error getting user tracks:', error);
      return [];
    }
  }

  /**
   * Calculate similarity between two users using Jaccard similarity
   */
  async calculateUserSimilarity(userId1, userId2, user1Tracks, user2Tracks) {
    try {
      // If user1Tracks not provided, fetch them
      if (!user1Tracks) {
        user1Tracks = await this.getUserTracks(userId1);
      }

      // If user2Tracks not provided, fetch them
      if (!user2Tracks) {
        user2Tracks = await this.getUserTracks(userId2);
      }

      const set1 = new Set(user1Tracks);
      const set2 = new Set(user2Tracks);

      // Calculate Jaccard similarity
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);

      const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

      // Apply additional weighting based on listening patterns
      const patternSimilarity = await this.calculateListeningPatternSimilarity(userId1, userId2);
      
      // Weighted combination
      return jaccardSimilarity * 0.7 + patternSimilarity * 0.3;

    } catch (error) {
      console.error('Error calculating user similarity:', error);
      return 0;
    }
  }

  /**
   * Calculate listening pattern similarity (time of day, frequency, etc.)
   */
  async calculateListeningPatternSimilarity(userId1, userId2) {
    try {
      // Note: Future enhancement to analyze listening history patterns
      // const db = mongoManager.getDb();
      
      // Get listening patterns for both users
      const [pattern1, pattern2] = await Promise.all([
        this.getListeningPattern(userId1),
        this.getListeningPattern(userId2)
      ]);

      // Calculate similarity based on listening hours
      const hourSimilarity = this.calculateHourSimilarity(pattern1.hours, pattern2.hours);
      
      // Calculate similarity based on listening frequency
      const frequencySimilarity = this.calculateFrequencySimilarity(
        pattern1.frequency, 
        pattern2.frequency
      );

      return (hourSimilarity * 0.6 + frequencySimilarity * 0.4);

    } catch (error) {
      console.error('Error calculating listening pattern similarity:', error);
      return 0.5; // Neutral similarity
    }
  }

  /**
   * Get listening pattern for a user
   */
  async getListeningPattern(userId) {
    try {
      const db = mongoManager.getDb();
      const listeningHistoryCollection = db.collection('listening_history');

      const history = await listeningHistoryCollection
        .find({ user_id: userId })
        .toArray();

      // Analyze listening hours
      const hourCounts = Array(24).fill(0);
      const dailyCounts = Array(7).fill(0);
      
      history.forEach(item => {
        const date = new Date(item.played_at);
        const hour = date.getHours();
        const day = date.getDay();
        
        hourCounts[hour]++;
        dailyCounts[day]++;
      });

      return {
        hours: hourCounts,
        days: dailyCounts,
        frequency: history.length / Math.max(1, this.getDaysSinceFirstListen(history)),
        total_listens: history.length
      };

    } catch (error) {
      console.error('Error getting listening pattern:', error);
      return {
        hours: Array(24).fill(0),
        days: Array(7).fill(0),
        frequency: 0,
        total_listens: 0
      };
    }
  }

  /**
   * Calculate hour-based listening similarity
   */
  calculateHourSimilarity(hours1, hours2) {
    // Normalize hour counts
    const total1 = hours1.reduce((sum, count) => sum + count, 0);
    const total2 = hours2.reduce((sum, count) => sum + count, 0);

    if (total1 === 0 || total2 === 0) return 0;

    const norm1 = hours1.map(count => count / total1);
    const norm2 = hours2.map(count => count / total2);

    // Calculate cosine similarity
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < 24; i++) {
      dotProduct += norm1[i] * norm2[i];
      magnitude1 += norm1[i] * norm1[i];
      magnitude2 += norm2[i] * norm2[i];
    }

    const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Calculate frequency similarity
   */
  calculateFrequencySimilarity(freq1, freq2) {
    if (freq1 === 0 && freq2 === 0) return 1;
    if (freq1 === 0 || freq2 === 0) return 0;

    const ratio = Math.min(freq1, freq2) / Math.max(freq1, freq2);
    return ratio;
  }

  /**
   * Get days since first listen
   */
  getDaysSinceFirstListen(history) {
    if (history.length === 0) return 1;

    const sortedHistory = history.sort((a, b) => 
      new Date(a.played_at) - new Date(b.played_at)
    );
    
    const firstListen = new Date(sortedHistory[0].played_at);
    const now = new Date();
    
    return Math.max(1, Math.ceil((now - firstListen) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Generate recommendations from similar users
   */
  async generateRecommendationsFromSimilarUsers(userId, similarUsers, options = {}) {
    const { limit = 50 } = options;

    try {
      const db = mongoManager.getDb();
      const listeningHistoryCollection = db.collection('listening_history');

      // Get user's already listened tracks
      const userTracks = await this.getUserTracks(userId);
      const userTrackSet = new Set(userTracks);

      // Collect tracks from similar users with weighted scores
      const trackScores = new Map();

      for (const similarUser of similarUsers) {
        const similarUserTracks = await listeningHistoryCollection
          .find({ user_id: similarUser.user_id })
          .toArray();

        similarUserTracks.forEach(item => {
          // Skip tracks user has already listened to
          if (userTrackSet.has(item.track_id)) return;

          const currentScore = trackScores.get(item.track_id) || {
            track_id: item.track_id,
            track_name: item.track_name,
            artist_name: item.artist_name,
            weighted_score: 0,
            recommender_count: 0,
            recommenders: []
          };

          // Weight by user similarity and recency
          const recencyWeight = this.calculateRecencyWeight(item.played_at);
          const score = similarUser.similarity_score * recencyWeight;

          currentScore.weighted_score += score;
          currentScore.recommender_count++;
          currentScore.recommenders.push({
            user_id: similarUser.user_id,
            similarity: similarUser.similarity_score,
            played_at: item.played_at
          });

          trackScores.set(item.track_id, currentScore);
        });
      }

      // Convert to array and sort by weighted score
      const recommendations = Array.from(trackScores.values())
        .sort((a, b) => b.weighted_score - a.weighted_score)
        .slice(0, limit);

      // Enrich with additional metadata
      return await this.enrichRecommendations(recommendations);

    } catch (error) {
      console.error('Error generating recommendations from similar users:', error);
      return [];
    }
  }

  /**
   * Calculate recency weight for recommendations
   */
  calculateRecencyWeight(playedAt) {
    const now = new Date();
    const playDate = new Date(playedAt);
    const daysDiff = (now - playDate) / (1000 * 60 * 60 * 24);

    // More recent plays get higher weight
    if (daysDiff <= 7) return 1.0;
    if (daysDiff <= 30) return 0.8;
    if (daysDiff <= 90) return 0.6;
    if (daysDiff <= 180) return 0.4;
    return 0.2;
  }

  /**
   * Enrich recommendations with metadata
   */
  async enrichRecommendations(recommendations) {
    try {
      const db = mongoManager.getDb();
      const trackMetadataCollection = db.collection('track_metadata');
      const audioFeaturesCollection = db.collection('audio_features');

      const trackIds = recommendations.map(r => r.track_id);

      const [metadata, audioFeatures] = await Promise.all([
        trackMetadataCollection.find({ track_id: { $in: trackIds } }).toArray(),
        audioFeaturesCollection.find({ track_id: { $in: trackIds } }).toArray()
      ]);

      const metadataMap = new Map(metadata.map(m => [m.track_id, m]));
      const audioFeaturesMap = new Map(audioFeatures.map(af => [af.track_id, af]));

      return recommendations.map(rec => ({
        ...rec,
        metadata: metadataMap.get(rec.track_id),
        audio_features: audioFeaturesMap.get(rec.track_id),
        recommendation_type: 'collaborative',
        confidence_score: Math.min(rec.weighted_score, 1.0)
      }));

    } catch (error) {
      console.error('Error enriching recommendations:', error);
      return recommendations;
    }
  }

  /**
   * Get user-item matrix for matrix factorization (advanced collaborative filtering)
   */
  async getUserItemMatrix(options = {}) {
    const { maxUsers = 1000, maxTracks = 5000 } = options;

    try {
      const db = mongoManager.getDb();
      const listeningHistoryCollection = db.collection('listening_history');

      // Get most active users and popular tracks
      const [topUsers, topTracks] = await Promise.all([
        listeningHistoryCollection.aggregate([
          { $group: { _id: '$user_id', listen_count: { $sum: 1 } } },
          { $sort: { listen_count: -1 } },
          { $limit: maxUsers }
        ]).toArray(),
        listeningHistoryCollection.aggregate([
          { $group: { _id: '$track_id', listen_count: { $sum: 1 } } },
          { $sort: { listen_count: -1 } },
          { $limit: maxTracks }
        ]).toArray()
      ]);

      const userIds = topUsers.map(u => u._id);
      const trackIds = topTracks.map(t => t._id);

      // Build user-item matrix
      const matrix = {};
      userIds.forEach(userId => {
        matrix[userId] = {};
        trackIds.forEach(trackId => {
          matrix[userId][trackId] = 0;
        });
      });

      // Fill matrix with listening counts
      const interactions = await listeningHistoryCollection
        .find({
          user_id: { $in: userIds },
          track_id: { $in: trackIds }
        })
        .toArray();

      interactions.forEach(interaction => {
        if (matrix[interaction.user_id]) {
          matrix[interaction.user_id][interaction.track_id] = 
            (matrix[interaction.user_id][interaction.track_id] || 0) + 1;
        }
      });

      return {
        matrix,
        userIds,
        trackIds,
        interactions: interactions.length
      };

    } catch (error) {
      console.error('Error building user-item matrix:', error);
      return { matrix: {}, userIds: [], trackIds: [], interactions: 0 };
    }
  }

  /**
   * Update model with new user interactions
   */
  async updateModel(userId, interactions) {
    // In a production system, this would update the collaborative filtering model
    // with new user interactions to improve future recommendations
    console.log(`Updating collaborative filtering model for user ${userId} with ${interactions.length} new interactions`);
  }
}

module.exports = CollaborativeFilter;