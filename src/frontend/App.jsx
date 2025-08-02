import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import Dashboard from './components/Dashboard';
import UserProfile from './components/UserProfile';
import PlaylistManager from './components/PlaylistManager';
import Header from './components/Header';
import AuthCallback from './components/AuthCallback';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LLMProvider } from './contexts/LLMContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import './styles/App.css';

/**
 * Main Application Component
 * Implements modern React-based frontend with routing and context providers
 */
function App() {
  return (
    <AuthProvider>
      <LLMProvider>
        <DatabaseProvider>
          <Router>
            <div className="app">
              <Header />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/chat" element={<ChatInterface />} />
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
                  <Route path="/playlists" element={<ProtectedRoute><PlaylistManager /></ProtectedRoute>} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </Router>
        </DatabaseProvider>
      </LLMProvider>
    </AuthProvider>
  );
}

/**
 * Home Component - Landing page with features overview
 */
function Home() {
  const { user, login } = useAuth();

  return (
    <div className="home">
      <section className="hero">
        <h1 className="hero-title">🎵 EchoTune AI</h1>
        <p className="hero-subtitle">
          Your Personal Music Discovery Assistant powered by Advanced AI
        </p>
        
        <div className="features-grid">
          <FeatureCard 
            icon="🤖" 
            title="AI-Powered Chat"
            description="Conversational music discovery with multiple LLM providers"
          />
          <FeatureCard 
            icon="🎯" 
            title="Smart Recommendations"
            description="Personalized suggestions based on your listening habits"
          />
          <FeatureCard 
            icon="📊" 
            title="Music Analytics"
            description="Deep insights into your musical preferences and trends"
          />
          <FeatureCard 
            icon="🎧" 
            title="Voice Interface"
            description="Hands-free music discovery with voice commands"
          />
        </div>

        <div className="auth-section">
          {!user ? (
            <div>
              <p className="auth-description">
                Connect your Spotify account to unlock personalized AI-powered music recommendations
              </p>
              <button onClick={login} className="auth-button primary">
                <svg className="spotify-icon" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 14.5c-.203 0-.4-.1-.5-.3-.8-1.2-2.1-1.8-3.5-1.8-1 0-2.1.2-3 .6-.1.1-.3.1-.4 0-.2-.1-.3-.3-.3-.5s.1-.4.3-.5c1.1-.5 2.3-.7 3.4-.7 1.7 0 3.3.7 4.4 2.1.1.2.1.4-.1.6-.1.1-.2.2-.3.2zm.7-2.9c-.2 0-.4-.1-.5-.2-1-1.5-2.7-2.3-4.4-2.3-1.3 0-2.6.3-3.8.9-.2.1-.4 0-.5-.2-.1-.2 0-.4.2-.5 1.4-.7 2.9-1 4.4-1 2 0 4 .9 5.2 2.6.1.2.1.4-.1.5-.2.1-.3.2-.5.2zm.8-3.1c-.3 0-.5-.1-.6-.3-1.2-1.8-3.2-2.8-5.2-2.8-1.5 0-3 .4-4.3 1.1-.2.1-.5 0-.6-.2-.1-.2 0-.5.2-.6 1.5-.8 3.2-1.2 4.9-1.2 2.3 0 4.6 1.1 6 3.3.1.2 0 .5-.2.6-.1.1-.2.1-.2.1z"/>
                </svg>
                Connect with Spotify
              </button>
              <a href="/chat" className="auth-button secondary">
                🤖 Try Demo Chat
              </a>
            </div>
          ) : (
            <UserWelcome user={user} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Feature Card Component
 */
function FeatureCard({ icon, title, description }) {
  return (
    <div className="feature-card">
      <span className="feature-icon">{icon}</span>
      <div className="feature-title">{title}</div>
      <div className="feature-description">{description}</div>
    </div>
  );
}

/**
 * User Welcome Component
 */
function UserWelcome({ user }) {
  return (
    <div className="user-welcome">
      <h2>Welcome back, {user.display_name || user.id}! 🎵</h2>
      <p className="user-details">
        <strong>Spotify {user.premium ? 'Premium' : 'Free'}</strong> • 
        {user.country || 'Unknown'} • 
        {user.followers?.total || 0} followers
      </p>
      <div className="user-actions">
        <a href="/chat" className="action-button">🤖 Advanced Chat</a>
        <a href="/dashboard" className="action-button">📊 Analytics Dashboard</a>
        <a href="/playlists" className="action-button">🎵 My Playlists</a>
      </div>
    </div>
  );
}

/**
 * Protected Route Component
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default App;