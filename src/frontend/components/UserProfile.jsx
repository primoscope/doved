// React is needed for JSX
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../contexts/DatabaseContext';

/**
 * User Profile Component
 * Manages user profile and music preferences
 */
function UserProfile() {
  const { user } = useAuth();
  const { saveUserData } = useDatabase();
  
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState({
    favoriteGenres: [],
    favoriteArtists: [],
    musicDiscovery: 'balanced',
    explicitContent: true,
    playlistPrivacy: 'private'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadUserProfile = useCallback(async () => {
    setLoading(true);
    
    try {
      // In a real app, this would load from database
      setProfile({
        ...user,
        totalTracks: 1247,
        totalArtists: 312,
        totalAlbums: 156,
        totalPlaylists: 23,
        memberSince: '2023-01-15',
        lastActive: new Date().toISOString()
      });
    } catch (error) {
      console.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user, loadUserProfile]);

  const handleSavePreferences = async () => {
    setSaving(true);
    
    try {
      const updatedUser = {
        ...user,
        preferences,
        updatedAt: new Date().toISOString()
      };

      const result = await saveUserData(updatedUser);
      
      if (result.success) {
        alert('Preferences saved successfully!');
      } else {
        throw new Error(result.error || 'Failed to save preferences');
      }
    } catch (error) {
      console.error('Save preferences error:', error);
      alert('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (!user) {
    return (
      <div className="user-profile">
        <div className="auth-required">
          <h2>🔐 Authentication Required</h2>
          <p>Please connect your Spotify account to view your profile.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-profile">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <div className="profile-header">
        <h1>👤 My Profile</h1>
        <p>Manage your music preferences and account settings</p>
      </div>

      <div className="profile-content">
        <ProfileStats profile={profile} />
        <ProfileInfo profile={profile} />
        <MusicPreferences 
          preferences={preferences}
          onChange={handlePreferenceChange}
          onSave={handleSavePreferences}
          saving={saving}
        />
      </div>
    </div>
  );
}

/**
 * Profile Stats Component
 */
function ProfileStats({ profile }) {
  const stats = [
    { label: 'Total Tracks', value: profile.totalTracks, icon: '🎵' },
    { label: 'Artists', value: profile.totalArtists, icon: '🎤' },
    { label: 'Albums', value: profile.totalAlbums, icon: '💿' },
    { label: 'Playlists', value: profile.totalPlaylists, icon: '📋' }
  ];

  return (
    <div className="profile-stats">
      <h2>📊 Your Music Stats</h2>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Profile Info Component
 */
function ProfileInfo({ profile }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="profile-info">
      <h2>ℹ️ Account Information</h2>
      <div className="info-grid">
        <div className="info-item">
          <label>Display Name</label>
          <span>{profile.display_name || 'Not set'}</span>
        </div>
        
        <div className="info-item">
          <label>Email</label>
          <span>{profile.email || 'Not provided'}</span>
        </div>
        
        <div className="info-item">
          <label>Country</label>
          <span>{profile.country || 'Unknown'}</span>
        </div>
        
        <div className="info-item">
          <label>Spotify Premium</label>
          <span>{profile.premium ? '✅ Yes' : '❌ No'}</span>
        </div>
        
        <div className="info-item">
          <label>Followers</label>
          <span>{profile.followers?.total || 0}</span>
        </div>
        
        <div className="info-item">
          <label>Member Since</label>
          <span>{formatDate(profile.memberSince)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Music Preferences Component
 */
function MusicPreferences({ preferences, onChange, onSave, saving }) {
  const genres = [
    'Pop', 'Rock', 'Hip Hop', 'Electronic', 'Jazz', 'Classical',
    'R&B', 'Country', 'Folk', 'Metal', 'Indie', 'Alternative'
  ];

  const discoveryOptions = [
    { value: 'conservative', label: 'Conservative (similar to current taste)' },
    { value: 'balanced', label: 'Balanced (mix of familiar and new)' },
    { value: 'adventurous', label: 'Adventurous (explore new genres)' }
  ];

  const handleGenreToggle = (genre) => {
    const current = preferences.favoriteGenres || [];
    const updated = current.includes(genre)
      ? current.filter(g => g !== genre)
      : [...current, genre];
    onChange('favoriteGenres', updated);
  };

  return (
    <div className="music-preferences">
      <h2>🎵 Music Preferences</h2>
      
      <div className="preference-section">
        <h3>Favorite Genres</h3>
        <div className="genre-grid">
          {genres.map(genre => (
            <button
              key={genre}
              className={`genre-chip ${(preferences.favoriteGenres || []).includes(genre) ? 'selected' : ''}`}
              onClick={() => handleGenreToggle(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      <div className="preference-section">
        <h3>Music Discovery</h3>
        <div className="discovery-options">
          {discoveryOptions.map(option => (
            <label key={option.value} className="radio-option">
              <input
                type="radio"
                name="musicDiscovery"
                value={option.value}
                checked={preferences.musicDiscovery === option.value}
                onChange={(e) => onChange('musicDiscovery', e.target.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="preference-section">
        <h3>Content Settings</h3>
        <div className="content-settings">
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={preferences.explicitContent}
              onChange={(e) => onChange('explicitContent', e.target.checked)}
            />
            <span>Allow explicit content</span>
          </label>
        </div>
      </div>

      <div className="preference-section">
        <h3>Playlist Privacy</h3>
        <div className="privacy-options">
          <label className="radio-option">
            <input
              type="radio"
              name="playlistPrivacy"
              value="private"
              checked={preferences.playlistPrivacy === 'private'}
              onChange={(e) => onChange('playlistPrivacy', e.target.value)}
            />
            <span>Private (default)</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="playlistPrivacy"
              value="public"
              checked={preferences.playlistPrivacy === 'public'}
              onChange={(e) => onChange('playlistPrivacy', e.target.value)}
            />
            <span>Public</span>
          </label>
        </div>
      </div>

      <div className="preference-actions">
        <button 
          className="save-preferences-btn"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

export default UserProfile;