const mongoManager = require('../database/mongodb');

/**
 * Content-Based Filtering for Music Recommendations
 * Uses audio features and track metadata to find similar songs
 */
class ContentBasedFilter {
  constructor() {
    this.audioFeatureWeights = {
      danceability: 0.2,
      energy: 0.2,
      valence: 0.15,
      acousticness: 0.15,
      instrumentalness: 0.1,
      speechiness: 0.05,
      liveness: 0.05,
      tempo: 0.08
    };
  }

  /**
   * Get content-based recommendations for a user
   */
  async getRecommendations(userId, listeningHistory, options = {}) {
    const { limit = 50, includeNewMusic = true } = options;

    try {
      // Calculate user's audio feature preferences
      const userProfile = await this.calculateUserAudioProfile(listeningHistory);
      
      // Get candidate tracks
      const candidateTracks = await this.getCandidateTracks(listeningHistory, {
        includeNewMusic,
        excludeUserTracks: listeningHistory.map(h => h.track_id)
      });

      // Calculate similarity scores
      const scoredTracks = await this.calculateSimilarityScores(userProfile, candidateTracks);

      // Sort by similarity and return top recommendations
      return scoredTracks
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, limit);

    } catch (error) {
      console.error('Error generating content-based recommendations:', error);
      return [];
    }
  }

  /**
   * Calculate user's audio feature preferences from listening history
   */
  async calculateUserAudioProfile(listeningHistory) {
    try {
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');
      
      // Get audio features for user's tracks
      const trackIds = listeningHistory.map(h => h.track_id);
      const audioFeatures = await audioFeaturesCollection
        .find({ track_id: { $in: trackIds } })
        .toArray();

      if (audioFeatures.length === 0) {
        // Return neutral profile for new users
        return this.getNeutralProfile();
      }

      // Calculate weighted averages based on play frequency
      const trackPlayCounts = this.calculatePlayCounts(listeningHistory);
      const profile = {};

      // Initialize feature sums
      Object.keys(this.audioFeatureWeights).forEach(feature => {
        profile[feature] = 0;
      });
      profile.tempo = 0;
      profile.loudness = 0;

      let totalWeight = 0;

      audioFeatures.forEach(features => {
        const playCount = trackPlayCounts.get(features.track_id) || 1;
        const weight = Math.log(playCount + 1); // Logarithmic weighting

        Object.keys(this.audioFeatureWeights).forEach(feature => {
          if (features[feature] !== undefined) {
            profile[feature] += features[feature] * weight;
          }
        });

        profile.tempo += features.tempo * weight;
        profile.loudness += features.loudness * weight;
        totalWeight += weight;
      });

      // Normalize by total weight
      Object.keys(profile).forEach(feature => {
        profile[feature] = totalWeight > 0 ? profile[feature] / totalWeight : 0.5;
      });

      // Add genre and artist preferences
      profile.preferred_genres = this.calculateGenrePreferences(listeningHistory);
      profile.preferred_artists = this.calculateArtistPreferences(listeningHistory);

      return profile;

    } catch (error) {
      console.error('Error calculating user audio profile:', error);
      return this.getNeutralProfile();
    }
  }

  /**
   * Get neutral profile for new users
   */
  getNeutralProfile() {
    const profile = {};
    Object.keys(this.audioFeatureWeights).forEach(feature => {
      profile[feature] = 0.5; // Neutral value
    });
    profile.tempo = 120; // Average tempo
    profile.loudness = -10; // Average loudness
    profile.preferred_genres = [];
    profile.preferred_artists = [];
    return profile;
  }

  /**
   * Calculate play counts for tracks
   */
  calculatePlayCounts(listeningHistory) {
    const playCountMap = new Map();
    
    listeningHistory.forEach(item => {
      const currentCount = playCountMap.get(item.track_id) || 0;
      playCountMap.set(item.track_id, currentCount + 1);
    });

    return playCountMap;
  }

  /**
   * Calculate genre preferences from listening history
   */
  calculateGenrePreferences() {
    // Future enhancement: analyze listening history for genre preferences
    // For now, return empty array
    return [];
  }

  /**
   * Calculate artist preferences from listening history
   */
  calculateArtistPreferences(listeningHistory) {
    const artistCounts = new Map();
    
    listeningHistory.forEach(item => {
      const currentCount = artistCounts.get(item.artist_name) || 0;
      artistCounts.set(item.artist_name, currentCount + 1);
    });

    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([artist, count]) => ({ artist, play_count: count }));
  }

  /**
   * Get candidate tracks for recommendations
   */
  async getCandidateTracks(listeningHistory, options = {}) {
    const { excludeUserTracks = [] } = options;
    // Note: includeNewMusic flag available for future enhancement

    try {
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');
      const trackMetadataCollection = db.collection('track_metadata');

      // Build query to exclude user's tracks
      const query = { track_id: { $nin: excludeUserTracks } };

      // Get tracks with audio features
      const [audioFeatures, trackMetadata] = await Promise.all([
        audioFeaturesCollection.find(query).limit(5000).toArray(),
        trackMetadataCollection.find(query).limit(5000).toArray()
      ]);

      // Merge audio features with metadata
      const metadataMap = new Map(trackMetadata.map(t => [t.track_id, t]));
      
      return audioFeatures
        .map(af => ({
          ...af,
          metadata: metadataMap.get(af.track_id)
        }))
        .filter(track => track.metadata); // Only include tracks with metadata

    } catch (error) {
      console.error('Error getting candidate tracks:', error);
      return [];
    }
  }

  /**
   * Calculate similarity scores between user profile and candidate tracks
   */
  async calculateSimilarityScores(userProfile, candidateTracks) {
    return candidateTracks.map(track => {
      const audioSimilarity = this.calculateAudioFeatureSimilarity(userProfile, track);
      const genreSimilarity = this.calculateGenreSimilarity(userProfile, track);
      const artistSimilarity = this.calculateArtistSimilarity(userProfile, track);

      // Weighted combination of similarity scores
      const similarity_score = (
        audioSimilarity * 0.7 +
        genreSimilarity * 0.2 +
        artistSimilarity * 0.1
      );

      return {
        track_id: track.track_id,
        track_name: track.metadata?.name || 'Unknown',
        artists: track.metadata?.artists || [],
        audio_features: track,
        metadata: track.metadata,
        similarity_score,
        similarity_breakdown: {
          audio: audioSimilarity,
          genre: genreSimilarity,
          artist: artistSimilarity
        }
      };
    });
  }

  /**
   * Calculate audio feature similarity using cosine similarity
   */
  calculateAudioFeatureSimilarity(userProfile, track) {
    const features = Object.keys(this.audioFeatureWeights);
    let dotProduct = 0;
    let userMagnitude = 0;
    let trackMagnitude = 0;

    features.forEach(feature => {
      const userValue = userProfile[feature] || 0.5;
      const trackValue = track[feature] || 0.5;
      const weight = this.audioFeatureWeights[feature];

      dotProduct += userValue * trackValue * weight;
      userMagnitude += Math.pow(userValue * weight, 2);
      trackMagnitude += Math.pow(trackValue * weight, 2);
    });

    // Cosine similarity
    const magnitude = Math.sqrt(userMagnitude) * Math.sqrt(trackMagnitude);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Calculate genre similarity
   */
  calculateGenreSimilarity(userProfile, track) {
    if (!userProfile.preferred_genres || userProfile.preferred_genres.length === 0) {
      return 0.5; // Neutral for new users
    }

    if (!track.metadata?.genres || track.metadata.genres.length === 0) {
      return 0.3; // Lower score for tracks without genre info
    }

    const userGenres = new Set(userProfile.preferred_genres.map(g => g.genre));
    const trackGenres = new Set(track.metadata.genres);
    
    const intersection = new Set([...userGenres].filter(g => trackGenres.has(g)));
    const union = new Set([...userGenres, ...trackGenres]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate artist similarity
   */
  calculateArtistSimilarity(userProfile, track) {
    if (!userProfile.preferred_artists || userProfile.preferred_artists.length === 0) {
      return 0.5; // Neutral for new users
    }

    if (!track.metadata?.artists || track.metadata.artists.length === 0) {
      return 0.3; // Lower score for tracks without artist info
    }

    const userArtists = new Set(userProfile.preferred_artists.map(a => a.artist));
    const trackArtists = new Set(track.metadata.artists.map(a => a.name));

    const intersection = new Set([...userArtists].filter(a => trackArtists.has(a)));
    
    if (intersection.size > 0) {
      return 1.0; // High score for matching artists
    }

    return 0.1; // Low score for different artists
  }

  /**
   * Find similar tracks to a given track
   */
  async findSimilarTracks(trackId, options = {}) {
    const { limit = 10 } = options;

    try {
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');

      // Get target track's audio features
      const targetTrack = await audioFeaturesCollection.findOne({ track_id: trackId });
      if (!targetTrack) {
        throw new Error('Track not found');
      }

      // Get all other tracks
      const candidateTracks = await audioFeaturesCollection
        .find({ track_id: { $ne: trackId } })
        .limit(1000)
        .toArray();

      // Calculate similarities
      const similarities = candidateTracks.map(track => {
        const similarity = this.calculateTrackSimilarity(targetTrack, track);
        return {
          track_id: track.track_id,
          similarity_score: similarity,
          audio_features: track
        };
      });

      return similarities
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, limit);

    } catch (error) {
      console.error('Error finding similar tracks:', error);
      return [];
    }
  }

  /**
   * Calculate similarity between two tracks
   */
  calculateTrackSimilarity(track1, track2) {
    const features = Object.keys(this.audioFeatureWeights);
    let similarity = 0;

    features.forEach(feature => {
      const value1 = track1[feature] || 0;
      const value2 = track2[feature] || 0;
      const weight = this.audioFeatureWeights[feature];
      
      // Use 1 - normalized distance for similarity
      const distance = Math.abs(value1 - value2);
      const featureSimilarity = 1 - distance;
      
      similarity += featureSimilarity * weight;
    });

    return similarity;
  }

  /**
   * Update feature weights based on user feedback
   */
  updateWeights(feedback) {
    // Adjust weights based on which features led to positive/negative feedback
    Object.keys(feedback).forEach(feature => {
      if (Object.prototype.hasOwnProperty.call(this.audioFeatureWeights, feature)) {
        const adjustment = feedback[feature] * 0.01; // Small adjustment
        this.audioFeatureWeights[feature] = Math.max(0.01, 
          Math.min(0.5, this.audioFeatureWeights[feature] + adjustment)
        );
      }
    });

    // Normalize weights to sum to 1
    const total = Object.values(this.audioFeatureWeights).reduce((sum, weight) => sum + weight, 0);
    Object.keys(this.audioFeatureWeights).forEach(feature => {
      this.audioFeatureWeights[feature] /= total;
    });
  }
}

module.exports = ContentBasedFilter;