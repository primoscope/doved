// React is needed for JSX

import { useAuth } from '../contexts/AuthContext';

/**
 * Header Component
 * Navigation and user information
 */
function Header() {
  const { user, login, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section">
          <h1 className="logo">🎵 EchoTune AI</h1>
          <span className="tagline">AI Music Assistant</span>
        </div>

        <nav className="main-nav">
          <a href="/" className="nav-link">Home</a>
          <a href="/chat" className="nav-link">Chat</a>
          {user && (
            <>
              <a href="/dashboard" className="nav-link">Dashboard</a>
              <a href="/playlists" className="nav-link">Playlists</a>
              <a href="/profile" className="nav-link">Profile</a>
            </>
          )}
        </nav>

        <div className="user-section">
          {user ? (
            <div className="user-info">
              <span className="user-name">
                Hello, {user.display_name || user.id}
              </span>
              <button onClick={logout} className="logout-btn">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={login} className="login-btn">
              Connect Spotify
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;