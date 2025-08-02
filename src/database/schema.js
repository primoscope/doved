/**
 * Database Schema Definitions for EchoTune AI
 * Defines data models and validation schemas for MongoDB collections
 */

const { ObjectId } = require('mongodb');

/**
 * User Profile Schema
 */
const UserProfileSchema = {
  spotify_id: { type: 'string', required: true, unique: true },
  display_name: { type: 'string', required: true },
  email: { type: 'string', required: false, unique: true },
  country: { type: 'string', required: false },
  followers: { type: 'number', default: 0 },
  premium: { type: 'boolean', default: false },
  preferences: {
    favorite_genres: { type: 'array', default: [] },
    preferred_artists: { type: 'array', default: [] },
    audio_features_preferences: {
      energy: { type: 'number', min: 0, max: 1 },
      valence: { type: 'number', min: 0, max: 1 },
      danceability: { type: 'number', min: 0, max: 1 },
      acousticness: { type: 'number', min: 0, max: 1 }
    }
  },
  listening_stats: {
    total_listening_time: { type: 'number', default: 0 },
    most_played_artist: { type: 'string' },
    most_played_genre: { type: 'string' },
    average_session_length: { type: 'number', default: 0 }
  },
  created_at: { type: 'date', default: () => new Date() },
  updated_at: { type: 'date', default: () => new Date() },
  last_active: { type: 'date', default: () => new Date() }
};

/**
 * Listening History Schema
 */
const ListeningHistorySchema = {
  user_id: { type: 'objectId', required: true },
  track_id: { type: 'string', required: true },
  track_name: { type: 'string', required: true },
  artist_name: { type: 'string', required: true },
  album_name: { type: 'string', required: true },
  played_at: { type: 'date', required: true },
  duration_ms: { type: 'number', required: true },
  popularity: { type: 'number', min: 0, max: 100 },
  context: {
    context_type: { type: 'string' }, // playlist, album, artist, search, etc.
    context_uri: { type: 'string' },
    device_type: { type: 'string' }
  },
  skip_count: { type: 'number', default: 0 },
  repeat_count: { type: 'number', default: 0 },
  created_at: { type: 'date', default: () => new Date() }
};

/**
 * Track Metadata Schema
 */
const TrackMetadataSchema = {
  track_id: { type: 'string', required: true, unique: true },
  name: { type: 'string', required: true },
  artists: { type: 'array', required: true },
  album: {
    id: { type: 'string' },
    name: { type: 'string' },
    release_date: { type: 'string' },
    total_tracks: { type: 'number' }
  },
  duration_ms: { type: 'number', required: true },
  explicit: { type: 'boolean', default: false },
  popularity: { type: 'number', min: 0, max: 100 },
  preview_url: { type: 'string' },
  spotify_url: { type: 'string' },
  genres: { type: 'array', default: [] },
  release_year: { type: 'number' },
  created_at: { type: 'date', default: () => new Date() },
  updated_at: { type: 'date', default: () => new Date() }
};

/**
 * Audio Features Schema
 */
const AudioFeaturesSchema = {
  track_id: { type: 'string', required: true, unique: true },
  acousticness: { type: 'number', min: 0, max: 1, required: true },
  danceability: { type: 'number', min: 0, max: 1, required: true },
  energy: { type: 'number', min: 0, max: 1, required: true },
  instrumentalness: { type: 'number', min: 0, max: 1, required: true },
  liveness: { type: 'number', min: 0, max: 1, required: true },
  loudness: { type: 'number', required: true },
  speechiness: { type: 'number', min: 0, max: 1, required: true },
  valence: { type: 'number', min: 0, max: 1, required: true },
  tempo: { type: 'number', required: true },
  key: { type: 'number', min: -1, max: 11, required: true },
  mode: { type: 'number', min: 0, max: 1, required: true },
  time_signature: { type: 'number', min: 3, max: 7, required: true },
  created_at: { type: 'date', default: () => new Date() }
};

/**
 * Recommendations Schema
 */
const RecommendationsSchema = {
  user_id: { type: 'objectId', required: true },
  recommendation_type: { type: 'string', required: true }, // content_based, collaborative, hybrid, mood_based
  tracks: { type: 'array', required: true },
  parameters: {
    seed_tracks: { type: 'array' },
    seed_artists: { type: 'array' },
    seed_genres: { type: 'array' },
    target_features: { type: 'object' },
    context: { type: 'string' }
  },
  confidence_score: { type: 'number', min: 0, max: 1 },
  user_feedback: {
    liked_tracks: { type: 'array', default: [] },
    disliked_tracks: { type: 'array', default: [] },
    saved_tracks: { type: 'array', default: [] }
  },
  created_at: { type: 'date', default: () => new Date() },
  expires_at: { type: 'date', default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // 30 days
};

/**
 * Chat History Schema
 */
const ChatHistorySchema = {
  user_id: { type: 'objectId', required: true },
  session_id: { type: 'string', required: true },
  message_type: { type: 'string', required: true }, // user, assistant, system
  content: { type: 'string', required: true },
  metadata: {
    llm_provider: { type: 'string' },
    model: { type: 'string' },
    tokens_used: { type: 'number' },
    response_time: { type: 'number' },
    intent: { type: 'string' },
    entities: { type: 'object' }
  },
  context: {
    spotify_data: { type: 'object' },
    recommendations: { type: 'array' },
    user_preferences: { type: 'object' }
  },
  timestamp: { type: 'date', default: () => new Date() }
};

/**
 * Playlists Schema
 */
const PlaylistsSchema = {
  user_id: { type: 'objectId', required: true },
  name: { type: 'string', required: true },
  description: { type: 'string' },
  playlist_type: { type: 'string', required: true }, // generated, manual, recommendation
  spotify_playlist_id: { type: 'string', unique: true },
  tracks: { type: 'array', required: true },
  generation_parameters: {
    mood: { type: 'string' },
    activity: { type: 'string' },
    genres: { type: 'array' },
    audio_features: { type: 'object' }
  },
  public: { type: 'boolean', default: false },
  collaborative: { type: 'boolean', default: false },
  created_at: { type: 'date', default: () => new Date() },
  updated_at: { type: 'date', default: () => new Date() }
};

/**
 * Schema validation helper functions
 */
class SchemaValidator {
  static validateUserProfile(data) {
    return this.validate(data, UserProfileSchema);
  }

  static validateListeningHistory(data) {
    return this.validate(data, ListeningHistorySchema);
  }

  static validateTrackMetadata(data) {
    return this.validate(data, TrackMetadataSchema);
  }

  static validateAudioFeatures(data) {
    return this.validate(data, AudioFeaturesSchema);
  }

  static validateRecommendations(data) {
    return this.validate(data, RecommendationsSchema);
  }

  static validateChatHistory(data) {
    return this.validate(data, ChatHistorySchema);
  }

  static validatePlaylist(data) {
    return this.validate(data, PlaylistsSchema);
  }

  static validate(data, schema) {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Field '${field}' is required`);
        continue;
      }
      
      // Skip validation if field is not provided and not required
      if (value === undefined || value === null) continue;
      
      // Type validation
      if (rules.type && !this.validateType(value, rules.type)) {
        errors.push(`Field '${field}' must be of type ${rules.type}`);
      }
      
      // Min/max validation for numbers
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Field '${field}' must be >= ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Field '${field}' must be <= ${rules.max}`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'objectId':
        return ObjectId.isValid(value);
      default:
        return true;
    }
  }
}

module.exports = {
  UserProfileSchema,
  ListeningHistorySchema,
  TrackMetadataSchema,
  AudioFeaturesSchema,
  RecommendationsSchema,
  ChatHistorySchema,
  PlaylistsSchema,
  SchemaValidator
};