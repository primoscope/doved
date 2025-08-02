// React is needed for JSX
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../contexts/DatabaseContext';

/**
 * Music Analytics Dashboard
 * Provides visualization of listening patterns and music insights
 */
function Dashboard() {
  const { user } = useAuth();
  const { getAnalytics } = useDatabase();
  
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('all');

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [user, timeRange]);

  const loadAnalytics = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const options = {};
      
      // Set date range based on selection
      if (timeRange !== 'all') {
        const now = new Date();
        const daysAgo = {
          '7d': 7,
          '30d': 30,
          '6m': 180,
          '1y': 365
        }[timeRange];
        
        if (daysAgo) {
          const fromDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
          options.dateFrom = fromDate.toISOString();
        }
      }

      const result = await getAnalytics(user.id, options);
      
      if (result.success) {
        setAnalytics(result.analytics);
      } else {
        setError(result.error || 'Failed to load analytics');
      }
    } catch (err) {
      console.error('Analytics loading error:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="dashboard">
        <div className="dashboard-message">
          <h2>🔐 Authentication Required</h2>
          <p>Please connect your Spotify account to view analytics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading your music analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-error">
          <h2>❌ Error Loading Analytics</h2>
          <p>{error}</p>
          <button onClick={loadAnalytics} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>📊 Music Analytics Dashboard</h1>
        <p>Insights into your musical preferences and listening habits</p>
        
        <div className="time-range-selector">
          <label>Time Range:</label>
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="time-range-select"
          >
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="6m">Last 6 Months</option>
            <option value="1y">Last Year</option>
          </select>
        </div>
      </div>

      <div className="dashboard-content">
        {analytics ? (
          <>
            <StatsOverview analytics={analytics} />
            <TopArtists artists={analytics.top_artists || []} />
            <MusicTrends analytics={analytics} />
            <RecommendationInsights userId={user.id} />
          </>
        ) : (
          <div className="no-data">
            <h3>📂 No Data Available</h3>
            <p>Start listening to music to see your analytics here!</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stats Overview Component
 */
function StatsOverview({ analytics }) {
  const formatDuration = (ms) => {
    if (!ms) return '0 min';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    return `${hours} hrs`;
  };

  const stats = [
    {
      icon: '🎵',
      label: 'Total Tracks',
      value: analytics.total_tracks || analytics.totalTracks || 0,
      color: 'var(--primary-color)'
    },
    {
      icon: '👨‍🎤',
      label: 'Unique Artists',
      value: analytics.unique_artists || analytics.uniqueArtists || 0,
      color: 'var(--success-color)'
    },
    {
      icon: '⏱️',
      label: 'Avg Duration',
      value: formatDuration(analytics.avg_duration || analytics.avgDuration),
      color: 'var(--warning-color)'
    },
    {
      icon: '🎯',
      label: 'Music Score',
      value: Math.round((analytics.total_tracks || 0) / 10) || 0,
      color: 'var(--error-color)'
    }
  ];

  return (
    <div className="stats-overview">
      <h2>📈 Overview</h2>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon" style={{ color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Top Artists Component
 */
function TopArtists({ artists }) {
  if (!artists || artists.length === 0) {
    return (
      <div className="top-artists">
        <h2>🎤 Top Artists</h2>
        <div className="no-data">No artist data available</div>
      </div>
    );
  }

  const maxPlays = Math.max(...artists.map(a => a.play_count || a.playCount || 0));

  return (
    <div className="top-artists">
      <h2>🎤 Top Artists</h2>
      <div className="artists-list">
        {artists.slice(0, 10).map((artist, index) => {
          const playCount = artist.play_count || artist.playCount || 0;
          const percentage = maxPlays > 0 ? (playCount / maxPlays) * 100 : 0;
          
          return (
            <div key={index} className="artist-item">
              <div className="artist-rank">#{index + 1}</div>
              <div className="artist-info">
                <div className="artist-name">{artist.artist_name || artist.name}</div>
                <div className="artist-stats">
                  <div 
                    className="play-bar"
                    style={{ width: `${percentage}%` }}
                  ></div>
                  <span className="play-count">{playCount} plays</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Music Trends Component
 */
function MusicTrends({ analytics }) {
  const trends = [
    {
      title: 'Listening Diversity',
      value: analytics.unique_artists && analytics.total_tracks 
        ? Math.round((analytics.unique_artists / analytics.total_tracks) * 100)
        : 0,
      unit: '%',
      description: 'Percentage of unique artists in your library'
    },
    {
      title: 'Discovery Rate',
      value: Math.round(Math.random() * 30 + 10), // Mock data for now
      unit: '%',
      description: 'New artists discovered this period'
    },
    {
      title: 'Repeat Factor',
      value: Math.round(Math.random() * 20 + 15), // Mock data for now
      unit: '%',
      description: 'How often you replay the same songs'
    }
  ];

  return (
    <div className="music-trends">
      <h2>📊 Music Trends</h2>
      <div className="trends-grid">
        {trends.map((trend, index) => (
          <div key={index} className="trend-card">
            <div className="trend-value">
              {trend.value}{trend.unit}
            </div>
            <div className="trend-title">{trend.title}</div>
            <div className="trend-description">{trend.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Recommendation Insights Component
 */
function RecommendationInsights({ userId }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getRecommendations } = useDatabase();

  useEffect(() => {
    loadRecommendations();
  }, [userId]);

  const loadRecommendations = async () => {
    try {
      const result = await getRecommendations(userId, { limit: 5 });
      if (result.success) {
        setRecommendations(result.recommendations);
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="recommendation-insights">
        <h2>🎯 AI Recommendations</h2>
        <div className="loading">Loading recommendations...</div>
      </div>
    );
  }

  return (
    <div className="recommendation-insights">
      <h2>🎯 AI Recommendations</h2>
      {recommendations.length > 0 ? (
        <div className="recommendations-list">
          {recommendations.map((rec, index) => (
            <div key={index} className="recommendation-item">
              <div className="rec-info">
                <div className="rec-track">{rec.track_name || rec.trackName}</div>
                <div className="rec-artist">{rec.artist_name || rec.artistName}</div>
              </div>
              <div className="rec-score">
                {Math.round((rec.score || 0) * 100)}% match
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-recommendations">
          <p>No AI recommendations available yet.</p>
          <p>Chat with the AI assistant to get personalized recommendations!</p>
        </div>
      )}
    </div>
  );
}

export default Dashboard;