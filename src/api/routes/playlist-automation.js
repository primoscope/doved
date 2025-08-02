const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * Enhanced Playlist Automation API
 * 
 * Provides intelligent playlist creation with:
 * - AI-powered track selection
 * - Automatic playlist generation
 * - Mood and activity-based curation
 * - Real-time Spotify integration
 */

/**
 * POST /api/playlists/create-smart
 * Create a smart playlist using AI recommendations
 */
router.post('/create-smart', async (req, res) => {
  try {
    const {
      userId = 'demo_user',
      playlistName,
      description,
      mood,
      activity,
      targetLength = 20, // number of tracks
      audioFeatures = {},
      seedTracks = [],
      seedGenres = [],
      isPublic = false,
      accessToken
    } = req.body;

    if (!playlistName) {
      return res.status(400).json({
        success: false,
        error: 'Playlist name is required'
      });
    }

    // Generate AI-curated track list
    const curatedTracks = await generateSmartPlaylist({
      mood,
      activity,
      targetLength,
      audioFeatures,
      seedTracks,
      seedGenres,
      userId
    });

    if (accessToken && curatedTracks.length > 0) {
      // Create actual Spotify playlist
      const spotifyPlaylist = await createSpotifyPlaylist({
        accessToken,
        name: playlistName,
        description: description || `AI-curated ${mood || activity || 'personalized'} playlist`,
        isPublic,
        trackUris: curatedTracks.map(track => track.uri).filter(uri => uri)
      });

      if (spotifyPlaylist.success) {
        res.json({
          success: true,
          playlist: {
            id: spotifyPlaylist.id,
            name: playlistName,
            description,
            url: spotifyPlaylist.url,
            trackCount: curatedTracks.length,
            tracks: curatedTracks
          },
          metadata: {
            createdAt: new Date().toISOString(),
            aiGenerated: true,
            criteria: { mood, activity, targetLength }
          }
        });
      } else {
        throw new Error('Failed to create Spotify playlist');
      }
    } else {
      // Return curated tracks without Spotify creation
      res.json({
        success: true,
        playlist: {
          name: playlistName,
          description,
          tracks: curatedTracks,
          trackCount: curatedTracks.length
        },
        metadata: {
          createdAt: new Date().toISOString(),
          aiGenerated: true,
          criteria: { mood, activity, targetLength },
          note: accessToken ? 'No tracks found' : 'No access token provided - returning track suggestions only'
        }
      });
    }

  } catch (error) {
    console.error('Smart playlist creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create smart playlist',
      message: error.message
    });
  }
});

/**
 * POST /api/playlists/auto-generate
 * Auto-generate playlists based on AI chat suggestions
 */
router.post('/auto-generate', async (req, res) => {
  try {
    const {
      userId: _userId = 'demo_user',
      aiSuggestion, // AI chat response with music recommendations
      contextData = {},
      accessToken,
      autoCreate = false
    } = req.body;

    if (!aiSuggestion) {
      return res.status(400).json({
        success: false,
        error: 'AI suggestion is required'
      });
    }

    // Parse AI suggestion for playlist creation
    const playlistData = await parseAISuggestion(aiSuggestion, contextData);
    
    if (!playlistData.tracks || playlistData.tracks.length === 0) {
      return res.json({
        success: true,
        message: 'No specific tracks found in AI suggestion',
        suggestion: aiSuggestion,
        playlistData
      });
    }

    if (autoCreate && accessToken) {
      // Automatically create the playlist
      const spotifyPlaylist = await createSpotifyPlaylist({
        accessToken,
        name: playlistData.name,
        description: playlistData.description,
        isPublic: false,
        trackUris: playlistData.tracks.map(track => track.uri).filter(uri => uri)
      });

      if (spotifyPlaylist.success) {
        res.json({
          success: true,
          autoCreated: true,
          playlist: {
            id: spotifyPlaylist.id,
            name: playlistData.name,
            url: spotifyPlaylist.url,
            tracks: playlistData.tracks
          },
          aiSuggestion
        });
      } else {
        throw new Error('Failed to auto-create playlist');
      }
    } else {
      // Return playlist suggestions for manual creation
      res.json({
        success: true,
        autoCreated: false,
        playlistSuggestion: playlistData,
        aiSuggestion,
        message: 'Playlist suggestion ready for creation'
      });
    }

  } catch (error) {
    console.error('Auto-generate playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-generate playlist',
      message: error.message
    });
  }
});

/**
 * POST /api/playlists/enhance
 * Enhance existing playlist with AI suggestions
 */
router.post('/enhance', async (req, res) => {
  try {
    const {
      playlistId,
      accessToken,
      enhancementType = 'similar', // 'similar', 'diverse', 'mood_continuation'
      targetAdditions = 5,
      userId = 'demo_user'
    } = req.body;

    if (!playlistId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Playlist ID and access token are required'
      });
    }

    // Get current playlist tracks
    const currentTracks = await getPlaylistTracks(accessToken, playlistId);
    
    if (!currentTracks || currentTracks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found or empty'
      });
    }

    // Generate enhancement suggestions
    const suggestions = await generatePlaylistEnhancements({
      currentTracks,
      enhancementType,
      targetAdditions,
      userId
    });

    // Add suggestions to playlist
    if (suggestions.length > 0) {
      const addResult = await addTracksToPlaylist(
        accessToken, 
        playlistId, 
        suggestions.map(track => track.uri)
      );

      if (addResult.success) {
        res.json({
          success: true,
          enhanced: true,
          addedTracks: suggestions,
          totalTracksAdded: suggestions.length,
          enhancementType
        });
      } else {
        throw new Error('Failed to add tracks to playlist');
      }
    } else {
      res.json({
        success: true,
        enhanced: false,
        message: 'No suitable enhancement tracks found'
      });
    }

  } catch (error) {
    console.error('Playlist enhancement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enhance playlist',
      message: error.message
    });
  }
});

/**
 * GET /api/playlists/suggestions
 * Get playlist suggestions based on current listening
 */
router.get('/suggestions', async (req, res) => {
  try {
    const {
      userId = 'demo_user',
      context = 'general',
      limit = 5
    } = req.query;

    // Generate playlist suggestions
    const suggestions = await generatePlaylistSuggestions({
      userId,
      context,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      suggestions,
      context,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Playlist suggestions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate playlist suggestions',
      message: error.message
    });
  }
});

/**
 * Helper Functions
 */

/**
 * Generate smart playlist with AI curation
 */
async function generateSmartPlaylist(params) {
  try {
    // Mock smart playlist generation - in production, use ML models and Spotify API
    const moodTracks = {
      energetic: [
        { name: 'High Energy Track', artist: 'Energy Artist', uri: 'spotify:track:energy1', audioFeatures: { energy: 0.9, valence: 0.8 } },
        { name: 'Pump Up Song', artist: 'Motivation Band', uri: 'spotify:track:energy2', audioFeatures: { energy: 0.85, valence: 0.9 } }
      ],
      chill: [
        { name: 'Relaxing Vibes', artist: 'Chill Artist', uri: 'spotify:track:chill1', audioFeatures: { energy: 0.3, valence: 0.6 } },
        { name: 'Peaceful Melody', artist: 'Calm Collective', uri: 'spotify:track:chill2', audioFeatures: { energy: 0.2, valence: 0.7 } }
      ],
      happy: [
        { name: 'Feel Good Hit', artist: 'Happy Crew', uri: 'spotify:track:happy1', audioFeatures: { energy: 0.7, valence: 0.9 } },
        { name: 'Sunshine Song', artist: 'Bright Band', uri: 'spotify:track:happy2', audioFeatures: { energy: 0.6, valence: 0.8 } }
      ]
    };

    const activityTracks = {
      workout: [
        { name: 'Gym Anthem', artist: 'Fitness Fighter', uri: 'spotify:track:workout1', audioFeatures: { energy: 0.95, danceability: 0.8 } },
        { name: 'Cardio Beat', artist: 'Exercise Elite', uri: 'spotify:track:workout2', audioFeatures: { energy: 0.9, danceability: 0.85 } }
      ],
      study: [
        { name: 'Focus Flow', artist: 'Study Sounds', uri: 'spotify:track:study1', audioFeatures: { energy: 0.4, instrumentalness: 0.8 } },
        { name: 'Concentration Central', artist: 'Brain Beats', uri: 'spotify:track:study2', audioFeatures: { energy: 0.3, instrumentalness: 0.9 } }
      ],
      commute: [
        { name: 'Drive Time', artist: 'Road Runners', uri: 'spotify:track:drive1', audioFeatures: { energy: 0.6, valence: 0.7 } },
        { name: 'Transit Tunes', artist: 'Journey Jams', uri: 'spotify:track:drive2', audioFeatures: { energy: 0.5, valence: 0.6 } }
      ]
    };

    let selectedTracks = [];

    // Combine mood and activity tracks
    if (params.mood && moodTracks[params.mood]) {
      selectedTracks = [...selectedTracks, ...moodTracks[params.mood]];
    }

    if (params.activity && activityTracks[params.activity]) {
      selectedTracks = [...selectedTracks, ...activityTracks[params.activity]];
    }

    // Add seed tracks if provided
    if (params.seedTracks && params.seedTracks.length > 0) {
      selectedTracks = [...selectedTracks, ...params.seedTracks];
    }

    // If no specific criteria, use general recommendations
    if (selectedTracks.length === 0) {
      selectedTracks = [
        ...moodTracks.happy,
        ...activityTracks.study
      ];
    }

    // Limit to target length
    return selectedTracks.slice(0, params.targetLength);

  } catch (error) {
    console.error('Generate smart playlist error:', error);
    return [];
  }
}

/**
 * Create Spotify playlist
 */
async function createSpotifyPlaylist({ accessToken, name, description, isPublic, trackUris }) {
  try {
    // Get user profile
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const userId = userResponse.data.id;

    // Create playlist
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name,
        description,
        public: isPublic
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const playlist = playlistResponse.data;

    // Add tracks to playlist
    if (trackUris && trackUris.length > 0) {
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
        {
          uris: trackUris
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return {
      success: true,
      id: playlist.id,
      url: playlist.external_urls.spotify,
      name: playlist.name
    };

  } catch (error) {
    console.error('Create Spotify playlist error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Parse AI suggestion for playlist data
 */
async function parseAISuggestion(suggestion, contextData) {
  try {
    // Extract playlist information from AI text
    const nameMatch = suggestion.match(/playlist.*?["']([^"']+)["']/i) || 
                     suggestion.match(/create.*?["']([^"']+)["']/i) ||
                     suggestion.match(/called.*?["']([^"']+)["']/i);
    
    const playlistName = nameMatch ? nameMatch[1] : 
                        contextData.mood ? `${contextData.mood} Mix` :
                        contextData.activity ? `${contextData.activity} Playlist` :
                        'AI Curated Playlist';

    // Extract artist/song mentions
    const artistMatches = suggestion.match(/artist.*?(?:like|such as|including)\s+([^.!?]+)/gi) || [];
    const _songMatches = suggestion.match(/song.*?["']([^"']+)["']/gi) || [];
    const _trackMatches = suggestion.match(/track.*?["']([^"']+)["']/gi) || [];

    // Create mock tracks from mentions
    const tracks = [];
    
    artistMatches.forEach((match, index) => {
      tracks.push({
        name: `Track by ${match.split(' ').slice(-1)[0]}`,
        artist: match.split(' ').slice(-1)[0],
        uri: `spotify:track:suggested_${index}`
      });
    });

    return {
      name: playlistName,
      description: `AI-generated playlist based on: ${suggestion.slice(0, 100)}...`,
      tracks: tracks.slice(0, 10) // Limit to 10 suggested tracks
    };

  } catch (error) {
    console.error('Parse AI suggestion error:', error);
    return {
      name: 'AI Suggested Playlist',
      description: 'Generated from AI recommendation',
      tracks: []
    };
  }
}

/**
 * Generate playlist suggestions
 */
async function generatePlaylistSuggestions(params) {
  try {
    const suggestions = [
      {
        name: 'Morning Energy Boost',
        description: 'Start your day with uplifting tracks',
        mood: 'energetic',
        estimatedTracks: 15,
        suitableFor: ['morning', 'commute', 'workout']
      },
      {
        name: 'Focus Flow',
        description: 'Instrumental and ambient tracks for concentration',
        mood: 'focused',
        estimatedTracks: 20,
        suitableFor: ['work', 'study', 'reading']
      },
      {
        name: 'Evening Unwind',
        description: 'Relaxing songs to end your day',
        mood: 'chill',
        estimatedTracks: 12,
        suitableFor: ['evening', 'relaxation', 'meditation']
      }
    ];

    return suggestions.slice(0, params.limit);

  } catch (error) {
    console.error('Generate playlist suggestions error:', error);
    return [];
  }
}

/**
 * Get playlist tracks from Spotify
 */
async function getPlaylistTracks(accessToken, playlistId) {
  try {
    const response = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    return response.data.items.map(item => item.track);

  } catch (error) {
    console.error('Get playlist tracks error:', error);
    return [];
  }
}

/**
 * Generate playlist enhancements
 */
async function generatePlaylistEnhancements(params) {
  try {
    // Mock enhancement suggestions
    const enhancements = [
      { name: 'Similar Vibe Track', artist: 'Related Artist', uri: 'spotify:track:enhancement1' },
      { name: 'Complementary Song', artist: 'Harmony Band', uri: 'spotify:track:enhancement2' }
    ];

    return enhancements.slice(0, params.targetAdditions);

  } catch (error) {
    console.error('Generate enhancements error:', error);
    return [];
  }
}

/**
 * Add tracks to Spotify playlist
 */
async function addTracksToPlaylist(accessToken, playlistId, trackUris) {
  try {
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: trackUris },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true };

  } catch (error) {
    console.error('Add tracks error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = router;