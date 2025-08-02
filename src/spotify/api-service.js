const axios = require('axios');
const RateLimiter = require('./rate-limiter');

/**
 * Spotify API Service
 * Handles general Spotify API operations like search, playlists, etc.
 */
class SpotifyAPIService {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.baseURL = 'https://api.spotify.com/v1';
  }

  /**
   * Search for tracks, artists, albums, or playlists
   */
  async search(query, type = 'track', options = {}) {
    const {
      limit = 20,
      offset = 0,
      market = 'US',
      accessToken
    } = options;

    if (!accessToken) {
      throw new Error('Access token is required for Spotify API calls');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/search`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          q: query,
          type,
          limit,
          offset,
          market
        }
      });

      return this.normalizeSearchResults(response.data, type);
    } catch (error) {
      console.error('Error searching Spotify:', error.message);
      
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 1;
        await this.rateLimiter.addDelay(retryAfter * 1000);
        return this.search(query, type, options);
      }
      
      throw error;
    }
  }

  /**
   * Search specifically for tracks with enhanced filtering
   */
  async searchTracks(query, options = {}) {
    const {
      limit = 20,
      mood = null,
      energy = null,
      danceability = null,
      accessToken
    } = options;

    try {
      // Enhance query with audio feature constraints
      let enhancedQuery = query;
      
      if (mood) {
        switch (mood.toLowerCase()) {
          case 'happy':
            enhancedQuery += ' genre:pop';
            break;
          case 'sad':
            enhancedQuery += ' genre:indie';
            break;
          case 'energetic':
            enhancedQuery += ' genre:electronic,dance';
            break;
          case 'calm':
            enhancedQuery += ' genre:ambient,acoustic';
            break;
        }
      }

      const searchResults = await this.search(enhancedQuery, 'track', {
        limit: limit * 2, // Get more to filter
        accessToken
      });

      // Filter by audio features if specified
      if (energy !== null || danceability !== null) {
        return this.filterTracksByFeatures(searchResults.tracks, {
          energy,
          danceability,
          limit
        });
      }

      return {
        tracks: searchResults.tracks.slice(0, limit),
        total: searchResults.total,
        query: enhancedQuery
      };

    } catch (error) {
      console.error('Error searching tracks:', error);
      throw error;
    }
  }

  /**
   * Get user's playlists
   */
  async getUserPlaylists(userId, options = {}) {
    const { limit = 50, offset = 0, accessToken } = options;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/users/${userId}/playlists`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          limit,
          offset
        }
      });

      return {
        playlists: response.data.items.map(playlist => this.normalizePlaylist(playlist)),
        total: response.data.total,
        next: response.data.next
      };

    } catch (error) {
      console.error('Error getting user playlists:', error);
      throw error;
    }
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(userId, playlistData, options = {}) {
    const { accessToken } = options;
    const {
      name,
      description = '',
      'public': isPublic = false,
      collaborative = false
    } = playlistData;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.post(`${this.baseURL}/users/${userId}/playlists`, {
        name,
        description,
        'public': isPublic,
        collaborative
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return this.normalizePlaylist(response.data);

    } catch (error) {
      console.error('Error creating playlist:', error);
      throw error;
    }
  }

  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(playlistId, trackUris, options = {}) {
    const { position = null, accessToken } = options;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const body = { uris: trackUris };
      if (position !== null) {
        body.position = position;
      }

      const response = await axios.post(
        `${this.baseURL}/playlists/${playlistId}/tracks`,
        body,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        snapshot_id: response.data.snapshot_id,
        added_tracks: trackUris.length,
        success: true
      };

    } catch (error) {
      console.error('Error adding tracks to playlist:', error);
      throw error;
    }
  }

  /**
   * Get recommendations from Spotify
   */
  async getRecommendations(options = {}) {
    const {
      seed_artists = [],
      seed_tracks = [],
      seed_genres = [],
      limit = 20,
      target_energy = null,
      target_danceability = null,
      target_valence = null,
      target_tempo = null,
      accessToken
    } = options;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    if (seed_artists.length + seed_tracks.length + seed_genres.length === 0) {
      throw new Error('At least one seed parameter is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const params = {
        limit,
        seed_artists: seed_artists.join(','),
        seed_tracks: seed_tracks.join(','),
        seed_genres: seed_genres.join(',')
      };

      // Add target audio features
      if (target_energy !== null) params.target_energy = target_energy;
      if (target_danceability !== null) params.target_danceability = target_danceability;
      if (target_valence !== null) params.target_valence = target_valence;
      if (target_tempo !== null) params.target_tempo = target_tempo;

      const response = await axios.get(`${this.baseURL}/recommendations`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params
      });

      return {
        tracks: response.data.tracks.map(track => this.normalizeTrack(track)),
        seeds: response.data.seeds
      };

    } catch (error) {
      console.error('Error getting Spotify recommendations:', error);
      throw error;
    }
  }

  /**
   * Get available genres for recommendations
   */
  async getAvailableGenres(accessToken) {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/recommendations/available-genre-seeds`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data.genres;

    } catch (error) {
      console.error('Error getting available genres:', error);
      throw error;
    }
  }

  /**
   * Get user's top artists
   */
  async getUserTopArtists(options = {}) {
    const {
      time_range = 'medium_term',
      limit = 20,
      offset = 0,
      accessToken
    } = options;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/me/top/artists`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          time_range,
          limit,
          offset
        }
      });

      return {
        artists: response.data.items.map(artist => this.normalizeArtist(artist)),
        total: response.data.total
      };

    } catch (error) {
      console.error('Error getting user top artists:', error);
      throw error;
    }
  }

  /**
   * Get user's top tracks
   */
  async getUserTopTracks(options = {}) {
    const {
      time_range = 'medium_term',
      limit = 20,
      offset = 0,
      accessToken
    } = options;

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    try {
      await this.rateLimiter.checkLimit();

      const response = await axios.get(`${this.baseURL}/me/top/tracks`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          time_range,
          limit,
          offset
        }
      });

      return {
        tracks: response.data.items.map(track => this.normalizeTrack(track)),
        total: response.data.total
      };

    } catch (error) {
      console.error('Error getting user top tracks:', error);
      throw error;
    }
  }

  /**
   * Normalize search results
   */
  normalizeSearchResults(data, _type) {
    const result = {
      total: 0,
      tracks: [],
      artists: [],
      albums: [],
      playlists: []
    };

    if (data.tracks) {
      result.tracks = data.tracks.items.map(track => this.normalizeTrack(track));
      result.total = data.tracks.total;
    }

    if (data.artists) {
      result.artists = data.artists.items.map(artist => this.normalizeArtist(artist));
      if (!result.total) result.total = data.artists.total;
    }

    if (data.albums) {
      result.albums = data.albums.items.map(album => this.normalizeAlbum(album));
      if (!result.total) result.total = data.albums.total;
    }

    if (data.playlists) {
      result.playlists = data.playlists.items.map(playlist => this.normalizePlaylist(playlist));
      if (!result.total) result.total = data.playlists.total;
    }

    return result;
  }

  /**
   * Normalize track data
   */
  normalizeTrack(track) {
    return {
      id: track.id,
      name: track.name,
      artists: track.artists.map(artist => ({
        id: artist.id,
        name: artist.name
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images
      },
      duration_ms: track.duration_ms,
      popularity: track.popularity,
      preview_url: track.preview_url,
      spotify_url: track.external_urls.spotify,
      uri: track.uri
    };
  }

  /**
   * Normalize artist data
   */
  normalizeArtist(artist) {
    return {
      id: artist.id,
      name: artist.name,
      genres: artist.genres || [],
      popularity: artist.popularity,
      followers: artist.followers?.total || 0,
      images: artist.images || [],
      spotify_url: artist.external_urls.spotify,
      uri: artist.uri
    };
  }

  /**
   * Normalize album data
   */
  normalizeAlbum(album) {
    return {
      id: album.id,
      name: album.name,
      artists: album.artists.map(artist => ({
        id: artist.id,
        name: artist.name
      })),
      total_tracks: album.total_tracks,
      release_date: album.release_date,
      images: album.images,
      spotify_url: album.external_urls.spotify,
      uri: album.uri
    };
  }

  /**
   * Normalize playlist data
   */
  normalizePlaylist(playlist) {
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      'public': playlist.public,
      collaborative: playlist.collaborative,
      tracks_total: playlist.tracks.total,
      images: playlist.images,
      owner: {
        id: playlist.owner.id,
        display_name: playlist.owner.display_name
      },
      spotify_url: playlist.external_urls.spotify,
      uri: playlist.uri
    };
  }

  /**
   * Filter tracks by audio features
   */
  async filterTracksByFeatures(tracks, criteria) {
    const { energy, danceability, limit = 20 } = criteria;
    
    // This would typically require fetching audio features for each track
    // For now, return the tracks as-is, but this can be enhanced with actual filtering
    console.log(`Filtering ${tracks.length} tracks by energy: ${energy}, danceability: ${danceability}`);
    
    return tracks.slice(0, limit);
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return {
      rateLimiter: this.rateLimiter.getStats(),
      service: 'SpotifyAPIService'
    };
  }
}

module.exports = SpotifyAPIService;