import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Playlist Manager Component
 * Provides one-click playlist creation and management from AI suggestions
 */
function PlaylistManager() {
  const { user, accessToken } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [_generatedTracks, setGeneratedTracks] = useState([]);
  const [_generatedPlaylistData, setGeneratedPlaylistData] = useState(null);

  useEffect(() => {
    if (user) {
      loadPlaylists();
    }
  }, [user]);

  const loadPlaylists = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlists/user/${user.id}`);
      const data = await response.json();

      if (data.success) {
        setPlaylists(data.playlists);
      } else {
        setError(data.error || 'Failed to load playlists');
      }
    } catch (err) {
      console.error('Load playlists error:', err);
      setError('Failed to load playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlaylist = async (playlistData) => {
    setCreating(true);
    
    try {
      const response = await fetch('/api/playlists/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...playlistData,
          userId: user.id,
          spotifyAccessToken: accessToken
        })
      });

      const data = await response.json();

      if (data.success) {
        setPlaylists(prev => [data.playlist, ...prev]);
        setShowCreateModal(false);
        // Show success message
        alert(`Playlist "${data.playlist.name}" created successfully!`);
      } else {
        throw new Error(data.error || 'Failed to create playlist');
      }
    } catch (err) {
      console.error('Create playlist error:', err);
      alert(`Failed to create playlist: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleGeneratePlaylist = async (prompt, options = {}) => {
    setGenerating(true);

    try {
      const response = await fetch('/api/playlists/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          userId: user.id,
          spotifyAccessToken: accessToken,
          trackCount: options.trackCount || 20,
          autoCreate: options.autoCreate || false
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.autoCreated) {
          setPlaylists(prev => [data.playlist, ...prev]);
          alert(`Playlist created with ${data.tracks.length} tracks!`);
        } else {
          // Show generated tracks for user to review
          setGeneratedTracks(data.tracks);
          setGeneratedPlaylistData(data.playlistData);
        }
        setShowGenerateModal(false);
      } else {
        throw new Error(data.error || 'Failed to generate playlist');
      }
    } catch (err) {
      console.error('Generate playlist error:', err);
      alert(`Failed to generate playlist: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="playlist-manager">
        <div className="auth-required">
          <h2>🔐 Authentication Required</h2>
          <p>Please connect your Spotify account to manage playlists.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="playlist-manager">
      <div className="playlist-header">
        <h1>🎵 My Playlists</h1>
        <p>AI-generated playlists and manual creations</p>
        
        <div className="playlist-actions">
          <button 
            className="btn btn-primary"
            onClick={() => setShowGenerateModal(true)}
            disabled={generating}
          >
            {generating ? '🤖 Generating...' : '🤖 Generate with AI'}
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={() => setShowCreateModal(true)}
            disabled={creating}
          >
            ➕ Create Manual
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your playlists...</p>
        </div>
      ) : error ? (
        <div className="error">
          <h3>❌ Error Loading Playlists</h3>
          <p>{error}</p>
          <button onClick={loadPlaylists} className="retry-btn">
            Try Again
          </button>
        </div>
      ) : (
        <PlaylistGrid 
          playlists={playlists} 
          onRefresh={loadPlaylists}
          userAccessToken={accessToken}
        />
      )}

      {showCreateModal && (
        <CreatePlaylistModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePlaylist}
          isCreating={creating}
        />
      )}

      {showGenerateModal && (
        <GeneratePlaylistModal
          onClose={() => setShowGenerateModal(false)}
          onGenerate={handleGeneratePlaylist}
          isGenerating={generating}
        />
      )}
    </div>
  );
}

/**
 * Playlist Grid Component
 */
function PlaylistGrid({ playlists, onRefresh, userAccessToken }) {
  if (playlists.length === 0) {
    return (
      <div className="empty-playlists">
        <div className="empty-icon">🎵</div>
        <h3>No Playlists Yet</h3>
        <p>Create your first AI-generated playlist or manually create one!</p>
      </div>
    );
  }

  return (
    <div className="playlist-grid">
      {playlists.map(playlist => (
        <PlaylistCard 
          key={playlist.id} 
          playlist={playlist}
          onRefresh={onRefresh}
          userAccessToken={userAccessToken}
        />
      ))}
    </div>
  );
}

/**
 * Playlist Card Component
 */
function PlaylistCard({ playlist, onRefresh, userAccessToken }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${playlist.name}"?`)) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/playlists/${playlist.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spotifyAccessToken: userAccessToken,
          deleteFromSpotify: confirm('Also delete from Spotify?')
        })
      });

      const data = await response.json();

      if (data.success) {
        onRefresh();
        alert('Playlist deleted successfully');
      } else {
        throw new Error(data.error || 'Failed to delete playlist');
      }
    } catch (err) {
      console.error('Delete playlist error:', err);
      alert(`Failed to delete playlist: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className={`playlist-card ${expanded ? 'expanded' : ''}`}>
      <div className="playlist-card-header">
        <div className="playlist-info">
          <h3 className="playlist-name">{playlist.name}</h3>
          <p className="playlist-meta">
            {playlist.trackCount} tracks • Created {formatDate(playlist.createdAt)}
          </p>
          {playlist.description && (
            <p className="playlist-description">{playlist.description}</p>
          )}
        </div>
        
        <div className="playlist-actions">
          {playlist.spotifyUrl && (
            <a 
              href={playlist.spotifyUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="spotify-link"
              title="Open in Spotify"
            >
              🎵
            </a>
          )}
          
          <button 
            className="expand-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▲' : '▼'}
          </button>
          
          <button 
            className="delete-btn"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete playlist"
          >
            {deleting ? '⏳' : '🗑️'}
          </button>
        </div>
      </div>

      {expanded && (
        <PlaylistDetails playlist={playlist} />
      )}
    </div>
  );
}

/**
 * Playlist Details Component
 */
function PlaylistDetails({ playlist }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylistDetails();
  }, [playlist.id]);

  const loadPlaylistDetails = async () => {
    try {
      const response = await fetch(`/api/playlists/${playlist.id}`);
      const data = await response.json();

      if (data.success) {
        setTracks(data.playlist.tracks || []);
      }
    } catch (err) {
      console.error('Load playlist details error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-tracks">Loading tracks...</div>;
  }

  return (
    <div className="playlist-details">
      <h4>Tracks ({tracks.length})</h4>
      <div className="tracks-list">
        {tracks.slice(0, 10).map((track, index) => (
          <div key={track.id || index} className="track-item">
            <span className="track-number">{index + 1}</span>
            <div className="track-info">
              <div className="track-name">{track.name}</div>
              <div className="track-artist">{track.artist}</div>
            </div>
          </div>
        ))}
        {tracks.length > 10 && (
          <div className="tracks-overflow">
            +{tracks.length - 10} more tracks
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Create Playlist Modal Component
 */
function CreatePlaylistModal({ onClose, onCreate, isCreating }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    public: false,
    collaborative: false,
    tracks: []
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onCreate(formData);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Create New Playlist</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="name">Playlist Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter playlist name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Optional description"
              rows="3"
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="public"
                checked={formData.public}
                onChange={handleChange}
              />
              Make playlist public
            </label>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="collaborative"
                checked={formData.collaborative}
                onChange={handleChange}
              />
              Allow collaboration
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isCreating || !formData.name.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Generate Playlist Modal Component
 */
function GeneratePlaylistModal({ onClose, onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState('');
  const [trackCount, setTrackCount] = useState(20);
  const [autoCreate, setAutoCreate] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt.trim(), { trackCount, autoCreate });
    }
  };

  const examplePrompts = [
    'Create an upbeat workout playlist',
    'Make a chill study music playlist',
    'Generate romantic dinner music',
    'Create energetic party songs',
    'Make a relaxing bedtime playlist'
  ];

  return (
    <div className="modal-overlay">
      <div className="modal generate-modal">
        <div className="modal-header">
          <h2>🤖 Generate AI Playlist</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="prompt">Describe your playlist *</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., 'Create an upbeat workout playlist with electronic music' or 'Make a chill study playlist with instrumental tracks'"
              rows="3"
              required
            />
          </div>

          <div className="examples">
            <p>Try these examples:</p>
            <div className="example-chips">
              {examplePrompts.map((example, index) => (
                <button
                  key={index}
                  type="button"
                  className="example-chip"
                  onClick={() => setPrompt(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="trackCount">Number of tracks</label>
              <select
                id="trackCount"
                value={trackCount}
                onChange={(e) => setTrackCount(parseInt(e.target.value))}
              >
                <option value={10}>10 tracks</option>
                <option value={15}>15 tracks</option>
                <option value={20}>20 tracks</option>
                <option value={30}>30 tracks</option>
                <option value={50}>50 tracks</option>
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={autoCreate}
                  onChange={(e) => setAutoCreate(e.target.checked)}
                />
                Auto-create playlist
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? '🤖 Generating...' : '🤖 Generate Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PlaylistManager;