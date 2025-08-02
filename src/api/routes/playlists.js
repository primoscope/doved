const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const databaseManager = require('../../database/database-manager');

/**
 * Spotify Playlist Automation API
 * Provides one-click playlist creation and management from AI suggestions
 */

/**
 * Create playlist from AI recommendations
 */
router.post('/create', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      tracks, 
      public: isPublic = false,
      collaborative = false,
      userId,
      spotifyAccessToken 
    } = req.body;

    if (!name || !tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Playlist name and tracks are required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Generate unique playlist ID
    const playlistId = uuidv4();

    // Create playlist object
    const playlist = {
      id: playlistId,
      name,
      description: description || 'AI-generated playlist created by EchoTune AI',
      tracks: tracks.map(track => ({
        id: track.id || track.trackId,
        name: track.name || track.trackName,
        artist: track.artist || track.artistName,
        album: track.album || track.albumName,
        uri: track.uri || track.spotifyUri,
        addedAt: new Date().toISOString()
      })),
      user_id: userId,
      public: isPublic,
      collaborative,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'ai_recommendation'
    };

    // Save playlist to database
    const _saveResult = await databaseManager.savePlaylist ? 
      await databaseManager.savePlaylist(playlist) :
      { success: true, id: playlistId };

    let spotifyPlaylist = null;

    // Create playlist on Spotify if access token provided
    if (spotifyAccessToken) {
      try {
        spotifyPlaylist = await createSpotifyPlaylist(
          userId,
          spotifyAccessToken,
          {
            name,
            description: playlist.description,
            public: isPublic,
            collaborative
          },
          tracks
        );

        // Update playlist with Spotify ID
        if (spotifyPlaylist && spotifyPlaylist.id) {
          playlist.spotify_id = spotifyPlaylist.id;
          playlist.spotifyUrl = spotifyPlaylist.external_urls?.spotify;
          
          // Update in database
          if (databaseManager.savePlaylist) {
            await databaseManager.savePlaylist(playlist);
          }
        }
      } catch (spotifyError) {
        console.error('Spotify playlist creation failed:', spotifyError);
        // Continue with local playlist creation even if Spotify fails
      }
    }

    res.json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        trackCount: playlist.tracks.length,
        spotifyId: playlist.spotify_id,
        spotifyUrl: playlist.spotifyUrl,
        createdAt: playlist.createdAt
      },
      spotifyPlaylist: spotifyPlaylist ? {
        id: spotifyPlaylist.id,
        url: spotifyPlaylist.external_urls?.spotify,
        snapshot_id: spotifyPlaylist.snapshot_id
      } : null,
      message: spotifyPlaylist ? 
        'Playlist created successfully on Spotify and saved locally' :
        'Playlist saved locally (connect Spotify for automatic sync)'
    });

  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create playlist',
      details: error.message
    });
  }
});

/**
 * Add tracks to existing playlist
 */
router.post('/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { tracks, spotifyAccessToken } = req.body;

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tracks array is required'
      });
    }

    // Get playlist from database (mock implementation)
    const playlist = {
      id: playlistId,
      spotify_id: 'mock_spotify_id',
      tracks: []
    };

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const newTracks = tracks.map(track => ({
      id: track.id || track.trackId,
      name: track.name || track.trackName,
      artist: track.artist || track.artistName,
      uri: track.uri || track.spotifyUri,
      addedAt: new Date().toISOString()
    }));

    // Add tracks to Spotify playlist if connected
    let spotifyResult = null;
    if (spotifyAccessToken && playlist.spotify_id) {
      try {
        spotifyResult = await addTracksToSpotifyPlaylist(
          playlist.spotify_id,
          spotifyAccessToken,
          newTracks
        );
      } catch (spotifyError) {
        console.error('Failed to add tracks to Spotify:', spotifyError);
      }
    }

    // Update local playlist
    playlist.tracks.push(...newTracks);
    playlist.updatedAt = new Date().toISOString();

    // Save updated playlist (mock implementation)
    // await databaseManager.savePlaylist(playlist);

    res.json({
      success: true,
      addedTracks: newTracks.length,
      totalTracks: playlist.tracks.length,
      spotifyResult: spotifyResult ? {
        snapshot_id: spotifyResult.snapshot_id
      } : null,
      message: `Added ${newTracks.length} tracks to playlist`
    });

  } catch (error) {
    console.error('Add tracks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add tracks to playlist',
      details: error.message
    });
  }
});

/**
 * Get user playlists
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId: _userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Mock implementation - would query database
    const mockPlaylists = [
      {
        id: 'playlist1',
        name: 'AI Workout Mix',
        description: 'High-energy tracks for your workout',
        trackCount: 25,
        spotifyId: 'spotify_playlist_1',
        spotifyUrl: 'https://open.spotify.com/playlist/spotify_playlist_1',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        source: 'ai_recommendation'
      },
      {
        id: 'playlist2',
        name: 'Chill Study Vibes',
        description: 'Perfect background music for studying',
        trackCount: 30,
        spotifyId: 'spotify_playlist_2',
        spotifyUrl: 'https://open.spotify.com/playlist/spotify_playlist_2',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'ai_recommendation'
      }
    ];

    res.json({
      success: true,
      playlists: mockPlaylists.slice(offset, offset + limit),
      total: mockPlaylists.length,
      hasMore: offset + limit < mockPlaylists.length
    });

  } catch (error) {
    console.error('Get user playlists error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user playlists',
      details: error.message
    });
  }
});

/**
 * Get playlist details
 */
router.get('/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;

    // Mock implementation - would query database
    const playlist = {
      id: playlistId,
      name: 'AI Generated Playlist',
      description: 'Created by EchoTune AI based on your preferences',
      tracks: [
        {
          id: 'track1',
          name: 'Sample Track 1',
          artist: 'Artist A',
          album: 'Album A',
          uri: 'spotify:track:track1',
          addedAt: new Date().toISOString()
        },
        {
          id: 'track2',
          name: 'Sample Track 2',
          artist: 'Artist B',
          album: 'Album B',
          uri: 'spotify:track:track2',
          addedAt: new Date().toISOString()
        }
      ],
      public: false,
      collaborative: false,
      spotifyId: 'spotify_playlist_id',
      spotifyUrl: 'https://open.spotify.com/playlist/spotify_playlist_id',
      createdAt: new Date().toISOString(),
      source: 'ai_recommendation'
    };

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    res.json({
      success: true,
      playlist
    });

  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get playlist',
      details: error.message
    });
  }
});

/**
 * Delete playlist
 */
router.delete('/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { spotifyAccessToken, deleteFromSpotify = false } = req.body;

    // Get playlist info (mock implementation)
    const playlist = {
      id: playlistId,
      spotify_id: 'spotify_playlist_id'
    };

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Delete from Spotify if requested and connected
    let spotifyDeleted = false;
    if (deleteFromSpotify && spotifyAccessToken && playlist.spotify_id) {
      try {
        await deleteSpotifyPlaylist(playlist.spotify_id, spotifyAccessToken);
        spotifyDeleted = true;
      } catch (spotifyError) {
        console.error('Failed to delete Spotify playlist:', spotifyError);
      }
    }

    // Delete from local database (mock implementation)
    // await databaseManager.deletePlaylist(playlistId);

    res.json({
      success: true,
      message: 'Playlist deleted successfully',
      spotifyDeleted
    });

  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete playlist',
      details: error.message
    });
  }
});

/**
 * Generate playlist from AI prompt
 */
router.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      userId, 
      trackCount = 20,
      spotifyAccessToken,
      autoCreate = false 
    } = req.body;

    if (!prompt || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Prompt and user ID are required'
      });
    }

    // Use recommendation engine to generate tracks based on prompt
    const recommendationEngine = require('../../ml/recommendation-engine-enhanced');
    
    // Parse prompt for context
    const context = parsePlaylistPrompt(prompt);
    
    // Generate recommendations
    const recommendations = await recommendationEngine.generateRecommendations(userId, {
      limit: trackCount,
      context: context.context,
      mood: context.mood,
      activity: context.activity
    });

    if (!recommendations.success || recommendations.recommendations.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate playlist recommendations'
      });
    }

    const playlistData = {
      name: context.playlistName || `AI Playlist: ${prompt.slice(0, 30)}...`,
      description: `Generated from: "${prompt}"`,
      tracks: recommendations.recommendations,
      context: context.context,
      generatedAt: new Date().toISOString()
    };

    // Auto-create playlist if requested
    if (autoCreate) {
      const createResult = await createPlaylistFromData(
        userId,
        playlistData,
        spotifyAccessToken
      );
      
      return res.json({
        success: true,
        playlist: createResult.playlist,
        tracks: recommendations.recommendations,
        context: context.context,
        autoCreated: true
      });
    }

    res.json({
      success: true,
      tracks: recommendations.recommendations,
      playlistData,
      context: context.context,
      message: 'Playlist generated successfully'
    });

  } catch (error) {
    console.error('Generate playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate playlist',
      details: error.message
    });
  }
});

/**
 * Helper function to create Spotify playlist
 */
async function createSpotifyPlaylist(userId, accessToken, playlistData, tracks) {
  try {
    // Create playlist
    const createResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: playlistData.name,
        description: playlistData.description,
        public: playlistData.public,
        collaborative: playlistData.collaborative
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Spotify playlist creation failed: ${createResponse.status}`);
    }

    const playlist = await createResponse.json();

    // Add tracks if provided
    if (tracks && tracks.length > 0) {
      const trackUris = tracks
        .map(track => track.uri || track.spotifyUri)
        .filter(uri => uri && uri.startsWith('spotify:track:'))
        .slice(0, 100); // Spotify limit

      if (trackUris.length > 0) {
        const addTracksResponse = await fetch(
          `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              uris: trackUris
            })
          }
        );

        if (addTracksResponse.ok) {
          const addResult = await addTracksResponse.json();
          playlist.snapshot_id = addResult.snapshot_id;
        }
      }
    }

    return playlist;
  } catch (error) {
    console.error('Create Spotify playlist error:', error);
    throw error;
  }
}

/**
 * Helper function to add tracks to Spotify playlist
 */
async function addTracksToSpotifyPlaylist(playlistId, accessToken, tracks) {
  const trackUris = tracks
    .map(track => track.uri)
    .filter(uri => uri && uri.startsWith('spotify:track:'))
    .slice(0, 100);

  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uris: trackUris
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to add tracks: ${response.status}`);
  }

  return await response.json();
}

/**
 * Helper function to delete Spotify playlist
 */
async function deleteSpotifyPlaylist(playlistId, accessToken) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to unfollow playlist: ${response.status}`);
  }
}

/**
 * Helper function to parse playlist generation prompt
 */
function parsePlaylistPrompt(prompt) {
  const context = {};
  let mood = null;
  let activity = null;
  let playlistName = null;

  // Extract mood
  const moodPatterns = {
    happy: /happy|joyful|upbeat|cheerful|energetic/i,
    sad: /sad|melancholy|depressing|emotional|heartbreak/i,
    calm: /calm|relaxing|peaceful|chill|zen/i,
    energetic: /energetic|pumped|high energy|intense|powerful/i,
    romantic: /romantic|love|intimate|passionate/i
  };

  for (const [moodType, pattern] of Object.entries(moodPatterns)) {
    if (pattern.test(prompt)) {
      mood = moodType;
      break;
    }
  }

  // Extract activity
  const activityPatterns = {
    workout: /workout|exercise|gym|running|fitness/i,
    study: /study|studying|focus|concentration|work/i,
    party: /party|celebration|dance|dancing|club/i,
    sleep: /sleep|bedtime|lullaby|nighttime/i,
    driving: /driving|road trip|travel|commute/i
  };

  for (const [activityType, pattern] of Object.entries(activityPatterns)) {
    if (pattern.test(prompt)) {
      activity = activityType;
      break;
    }
  }

  // Extract playlist name from "create/make a playlist called/named X"
  const nameMatch = prompt.match(/(?:create|make).*?playlist.*?(?:called|named|titled)\s+"([^"]+)"/i) ||
                   prompt.match(/(?:create|make).*?playlist.*?(?:called|named|titled)\s+([^,.\n]+)/i);
  
  if (nameMatch) {
    playlistName = nameMatch[1].trim();
  }

  return {
    context,
    mood,
    activity,
    playlistName
  };
}

/**
 * Helper function to create playlist from generated data
 */
async function createPlaylistFromData(userId, playlistData, _spotifyAccessToken) {
  // Implementation would call the create endpoint
  // For now, return mock result
  return {
    playlist: {
      id: 'generated_' + Date.now(),
      name: playlistData.name,
      description: playlistData.description,
      trackCount: playlistData.tracks.length,
      createdAt: new Date().toISOString()
    }
  };
}

module.exports = router;