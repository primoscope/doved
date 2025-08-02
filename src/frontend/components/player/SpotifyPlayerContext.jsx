import { createContext, useContext, useState, useEffect } from 'react';

const SpotifyPlayerContext = createContext();

/**
 * Spotify Web Player SDK Context Provider
 * 
 * Provides Spotify Web Player functionality:
 * - Music playback control
 * - Current track information
 * - Playlist management
 * - Volume control
 * - Real-time player state updates
 */
export const SpotifyPlayerProvider = ({ children }) => {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    // Get access token from local storage or auth context
    const _storedUser = localStorage.getItem('echotune_user');
    const storedToken = localStorage.getItem('spotify_access_token');
    
    if (storedToken) {
      setAccessToken(storedToken);
      initializePlayer(storedToken);
    }
  }, []);

  /**
   * Initialize Spotify Web Player SDK
   */
  const initializePlayer = (token) => {
    // Load Spotify Web Player SDK
    if (!window.Spotify) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);

      window.onSpotifyWebPlaybackSDKReady = () => {
        createPlayer(token);
      };
    } else {
      createPlayer(token);
    }
  };

  /**
   * Create Spotify Player instance
   */
  const createPlayer = (token) => {
    const spotifyPlayer = new window.Spotify.Player({
      name: 'EchoTune AI Player',
      getOAuthToken: (cb) => {
        cb(token);
      },
      volume: volume
    });

    // Player event handlers
    spotifyPlayer.addListener('ready', ({ device_id }) => {
      console.log('🎵 Spotify Player ready with Device ID:', device_id);
      setDeviceId(device_id);
      setIsReady(true);
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      console.log('❌ Spotify Player not ready with Device ID:', device_id);
      setIsReady(false);
    });

    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (state) {
        setPlayerState(state);
        setCurrentTrack(state.track_window.current_track);
        setIsPlaying(!state.paused);
        console.log('🎵 Player state changed:', {
          track: state.track_window.current_track?.name,
          artist: state.track_window.current_track?.artists[0]?.name,
          playing: !state.paused
        });
      }
    });

    spotifyPlayer.addListener('initialization_error', ({ message }) => {
      console.error('Spotify initialization error:', message);
    });

    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('Spotify authentication error:', message);
    });

    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('Spotify account error:', message);
    });

    spotifyPlayer.addListener('playback_error', ({ message }) => {
      console.error('Spotify playback error:', message);
    });

    // Connect to the player
    spotifyPlayer.connect().then(success => {
      if (success) {
        console.log('✅ Spotify Player connected successfully');
        setPlayer(spotifyPlayer);
      } else {
        console.error('❌ Failed to connect Spotify Player');
      }
    });
  };

  /**
   * Play a track or playlist
   */
  const playTrack = async (trackUri, contextUri = null) => {
    if (!player || !deviceId || !accessToken) {
      console.warn('Player not ready');
      return false;
    }

    try {
      const playOptions = {
        device_id: deviceId,
        uris: trackUri ? [trackUri] : undefined,
        context_uri: contextUri
      };

      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(playOptions)
      });

      if (response.status === 202 || response.status === 204) {
        console.log('✅ Track started playing');
        return true;
      } else {
        console.error('Failed to start playback:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Play track error:', error);
      return false;
    }
  };

  /**
   * Pause playback
   */
  const pauseTrack = async () => {
    if (!player) return;

    try {
      await player.pause();
      console.log('⏸️ Playback paused');
    } catch (error) {
      console.error('Pause error:', error);
    }
  };

  /**
   * Resume playback
   */
  const resumeTrack = async () => {
    if (!player) return;

    try {
      await player.resume();
      console.log('▶️ Playback resumed');
    } catch (error) {
      console.error('Resume error:', error);
    }
  };

  /**
   * Skip to next track
   */
  const nextTrack = async () => {
    if (!player) return;

    try {
      await player.nextTrack();
      console.log('⏭️ Next track');
    } catch (error) {
      console.error('Next track error:', error);
    }
  };

  /**
   * Skip to previous track
   */
  const previousTrack = async () => {
    if (!player) return;

    try {
      await player.previousTrack();
      console.log('⏮️ Previous track');
    } catch (error) {
      console.error('Previous track error:', error);
    }
  };

  /**
   * Set volume (0-1)
   */
  const setPlayerVolume = async (volumeLevel) => {
    if (!player) return;

    try {
      await player.setVolume(volumeLevel);
      setVolume(volumeLevel);
      console.log(`🔊 Volume set to ${Math.round(volumeLevel * 100)}%`);
    } catch (error) {
      console.error('Volume error:', error);
    }
  };

  /**
   * Get current player state
   */
  const getCurrentState = async () => {
    if (!player) return null;

    try {
      const state = await player.getCurrentState();
      return state;
    } catch (error) {
      console.error('Get state error:', error);
      return null;
    }
  };

  /**
   * Search for tracks using Spotify API
   */
  const searchTracks = async (query, limit = 20) => {
    if (!accessToken) return [];

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const data = await response.json();
      return data.tracks?.items || [];
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  };

  const value = {
    player,
    deviceId,
    playerState,
    isReady,
    currentTrack,
    isPlaying,
    volume,
    accessToken,
    setAccessToken,
    initializePlayer,
    playTrack,
    pauseTrack,
    resumeTrack,
    nextTrack,
    previousTrack,
    setPlayerVolume,
    getCurrentState,
    searchTracks
  };

  return (
    <SpotifyPlayerContext.Provider value={value}>
      {children}
    </SpotifyPlayerContext.Provider>
  );
};

export const useSpotifyPlayer = () => {
  const context = useContext(SpotifyPlayerContext);
  if (!context) {
    throw new Error('useSpotifyPlayer must be used within a SpotifyPlayerProvider');
  }
  return context;
};