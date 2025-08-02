import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { SocketProvider } from './realtime/SocketContext';
import { SpotifyPlayerProvider } from './player/SpotifyPlayerContext';
import Header from './layout/Header';
import ChatInterface from './chat/ChatInterface';
import Dashboard from './dashboard/Dashboard';
import PlaylistManager from './playlists/PlaylistManager';
import UserProfile from './profile/UserProfile';
import LandingPage from './pages/LandingPage';
import './App.css';

/**
 * Main EchoTune AI Application Component
 * 
 * Provides context providers for:
 * - Authentication (Spotify OAuth)
 * - Real-time communication (Socket.IO)
 * - Music player (Spotify Web Player SDK)
 * 
 * Handles routing for different application views
 */
function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialize application
    const initializeApp = async () => {
      try {
        // Check authentication status
        const _authStatus = localStorage.getItem('echotune_user');
        
        // Initialize health check
        const healthResponse = await fetch('/health');
        const healthData = await healthResponse.json();
        
        if (healthData.status === 'error') {
          throw new Error('Application health check failed');
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('App initialization error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h2>🎵 Initializing EchoTune AI...</h2>
        <p>Setting up your personalized music experience</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>⚠️ Application Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          🔄 Retry
        </button>
      </div>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <SpotifyPlayerProvider>
            <div className="app">
              <Header />
              
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/chat" element={<ChatInterface />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/playlists" element={<PlaylistManager />} />
                  <Route path="/profile" element={<UserProfile />} />
                </Routes>
              </main>
            </div>
          </SpotifyPlayerProvider>
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;