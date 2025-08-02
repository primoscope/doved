const axios = require('axios');
const RateLimiter = require('./rate-limiter');
const mongoManager = require('../database/mongodb');

/**
 * Spotify Audio Features Service
 * Handles fetching and caching of audio features from Spotify API
 */
class SpotifyAudioFeaturesService {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.baseURL = 'https://api.spotify.com/v1';
    this.cache = new Map(); // In-memory cache for session
  }

  /**
   * Get audio features for a single track
   */
  async getAudioFeatures(trackId, accessToken) {
    try {
      // Check cache first
      if (this.cache.has(trackId)) {
        return this.cache.get(trackId);
      }

      // Check database cache
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');
      
      const cachedFeatures = await audioFeaturesCollection.findOne({ track_id: trackId });
      if (cachedFeatures) {
        this.cache.set(trackId, cachedFeatures);
        return cachedFeatures;
      }

      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Fetch from Spotify API
      const response = await axios.get(`${this.baseURL}/audio-features/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const audioFeatures = this.normalizeAudioFeatures(response.data);
      
      // Cache in memory and database
      this.cache.set(trackId, audioFeatures);
      await this.cacheInDatabase(audioFeatures);

      return audioFeatures;
    } catch (error) {
      console.error(`Error fetching audio features for track ${trackId}:`, error.message);
      
      if (error.response?.status === 429) {
        // Rate limited - add delay and retry
        const retryAfter = error.response.headers['retry-after'] || 1;
        await this.rateLimiter.addDelay(retryAfter * 1000);
        return this.getAudioFeatures(trackId, accessToken);
      }
      
      throw error;
    }
  }

  /**
   * Get audio features for multiple tracks (batch processing)
   */
  async getBatchAudioFeatures(trackIds, accessToken, options = {}) {
    const { batchSize = 100, onProgress = null } = options;
    const results = [];
    const errors = [];

    // Process in batches to respect API limits
    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);
      
      try {
        await this.rateLimiter.checkLimit();

        const response = await axios.get(`${this.baseURL}/audio-features`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            ids: batch.join(',')
          }
        });

        const batchFeatures = response.data.audio_features
          .filter(features => features !== null)
          .map(features => this.normalizeAudioFeatures(features));

        // Cache all results
        for (const features of batchFeatures) {
          this.cache.set(features.track_id, features);
          await this.cacheInDatabase(features);
        }

        results.push(...batchFeatures);

        if (onProgress) {
          onProgress({
            processed: Math.min(i + batchSize, trackIds.length),
            total: trackIds.length,
            currentBatch: batchFeatures.length
          });
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing batch ${i}-${i + batchSize}:`, error.message);
        
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 1;
          await this.rateLimiter.addDelay(retryAfter * 1000);
          i -= batchSize; // Retry this batch
          continue;
        }
        
        errors.push({
          batch: batch,
          error: error.message
        });
      }
    }

    return {
      results,
      errors,
      totalProcessed: results.length,
      totalRequested: trackIds.length
    };
  }

  /**
   * Get cached audio features from database
   */
  async getCachedAudioFeatures(trackIds) {
    try {
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');
      
      const cachedFeatures = await audioFeaturesCollection
        .find({ track_id: { $in: trackIds } })
        .toArray();

      return cachedFeatures;
    } catch (error) {
      console.error('Error fetching cached audio features:', error.message);
      return [];
    }
  }

  /**
   * Get missing track IDs that need audio features
   */
  async getMissingTrackIds(trackIds) {
    const cachedFeatures = await this.getCachedAudioFeatures(trackIds);
    const cachedTrackIds = cachedFeatures.map(f => f.track_id);
    return trackIds.filter(id => !cachedTrackIds.includes(id));
  }

  /**
   * Normalize audio features data
   */
  normalizeAudioFeatures(rawFeatures) {
    return {
      track_id: rawFeatures.id,
      acousticness: rawFeatures.acousticness,
      danceability: rawFeatures.danceability,
      energy: rawFeatures.energy,
      instrumentalness: rawFeatures.instrumentalness,
      liveness: rawFeatures.liveness,
      loudness: rawFeatures.loudness,
      speechiness: rawFeatures.speechiness,
      valence: rawFeatures.valence,
      tempo: rawFeatures.tempo,
      key: rawFeatures.key,
      mode: rawFeatures.mode,
      time_signature: rawFeatures.time_signature,
      created_at: new Date()
    };
  }

  /**
   * Cache audio features in database
   */
  async cacheInDatabase(audioFeatures) {
    try {
      const db = mongoManager.getDb();
      const audioFeaturesCollection = db.collection('audio_features');
      
      await audioFeaturesCollection.updateOne(
        { track_id: audioFeatures.track_id },
        { $set: audioFeatures },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error caching audio features in database:', error.message);
    }
  }

  /**
   * Get track metadata from Spotify
   */
  async getTrackMetadata(trackId, accessToken) {
    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return this.normalizeTrackMetadata(response.data);
    } catch (error) {
      console.error(`Error fetching track metadata for ${trackId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get multiple track metadata (batch)
   */
  async getBatchTrackMetadata(trackIds, accessToken, options = {}) {
    const { batchSize = 50 } = options;
    const results = [];

    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);
      
      try {
        await this.rateLimiter.checkLimit();

        const response = await axios.get(`${this.baseURL}/tracks`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            ids: batch.join(',')
          }
        });

        const batchMetadata = response.data.tracks
          .filter(track => track !== null)
          .map(track => this.normalizeTrackMetadata(track));

        results.push(...batchMetadata);

        // Cache in database
        await this.cacheTrackMetadata(batchMetadata);

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing metadata batch ${i}-${i + batchSize}:`, error.message);
        
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 1;
          await this.rateLimiter.addDelay(retryAfter * 1000);
          i -= batchSize; // Retry this batch
          continue;
        }
      }
    }

    return results;
  }

  /**
   * Normalize track metadata
   */
  normalizeTrackMetadata(rawTrack) {
    return {
      track_id: rawTrack.id,
      name: rawTrack.name,
      artists: rawTrack.artists.map(artist => ({
        id: artist.id,
        name: artist.name
      })),
      album: {
        id: rawTrack.album.id,
        name: rawTrack.album.name,
        release_date: rawTrack.album.release_date,
        total_tracks: rawTrack.album.total_tracks
      },
      duration_ms: rawTrack.duration_ms,
      explicit: rawTrack.explicit,
      popularity: rawTrack.popularity,
      preview_url: rawTrack.preview_url,
      spotify_url: rawTrack.external_urls.spotify,
      release_year: rawTrack.album.release_date ? parseInt(rawTrack.album.release_date.substring(0, 4)) : null,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  /**
   * Cache track metadata in database
   */
  async cacheTrackMetadata(metadataArray) {
    try {
      const db = mongoManager.getDb();
      const trackMetadataCollection = db.collection('track_metadata');
      
      const operations = metadataArray.map(metadata => ({
        updateOne: {
          filter: { track_id: metadata.track_id },
          update: { $set: metadata },
          upsert: true
        }
      }));

      if (operations.length > 0) {
        await trackMetadataCollection.bulkWrite(operations);
      }
    } catch (error) {
      console.error('Error caching track metadata:', error.message);
    }
  }

  /**
   * Process listening history with audio features
   */
  async enrichListeningHistory(listeningHistory, accessToken, options = {}) {
    const { includeMetadata = true, onProgress = null } = options;
    
    // Extract unique track IDs
    const uniqueTrackIds = [...new Set(listeningHistory.map(item => item.track_id))];
    
    // Get missing audio features
    const missingTrackIds = await this.getMissingTrackIds(uniqueTrackIds);
    
    console.log(`Processing ${missingTrackIds.length} missing audio features out of ${uniqueTrackIds.length} total tracks`);

    // Fetch missing audio features
    if (missingTrackIds.length > 0) {
      await this.getBatchAudioFeatures(missingTrackIds, accessToken, {
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({
              stage: 'audio_features',
              ...progress
            });
          }
        }
      });
    }

    // Fetch metadata if requested
    if (includeMetadata) {
      await this.getBatchTrackMetadata(uniqueTrackIds, accessToken);
    }

    // Get all audio features
    const allAudioFeatures = await this.getCachedAudioFeatures(uniqueTrackIds);
    const audioFeaturesMap = new Map(allAudioFeatures.map(af => [af.track_id, af]));

    // Enrich listening history
    const enrichedHistory = listeningHistory.map(item => ({
      ...item,
      audio_features: audioFeaturesMap.get(item.track_id) || null
    }));

    return enrichedHistory;
  }

  /**
   * Clear memory cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCache: this.cache.size,
      rateLimiter: this.rateLimiter.getStats()
    };
  }
}

module.exports = SpotifyAudioFeaturesService;