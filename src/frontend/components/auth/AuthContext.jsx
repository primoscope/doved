import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

/**
 * Authentication Context Provider
 * 
 * Manages Spotify OAuth authentication and user session:
 * - User profile information
 * - Access token management
 * - Authentication state
 * - Session persistence
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored authentication
    checkAuthStatus();
    
    // Handle OAuth callback
    handleOAuthCallback();
  }, []);

  /**
   * Check authentication status from localStorage
   */
  const checkAuthStatus = () => {
    try {
      const storedUser = localStorage.getItem('echotune_user');
      const storedToken = localStorage.getItem('spotify_access_token');
      
      if (storedUser && storedToken) {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setAccessToken(storedToken);
        setIsAuthenticated(true);
        
        // Verify token is still valid
        validateToken(storedToken);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle OAuth callback from URL parameters
   */
  const handleOAuthCallback = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const userParam = urlParams.get('user');
    const error = urlParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      // Could show error notification here
      return;
    }

    if (authStatus === 'success' && userParam) {
      try {
        const userData = JSON.parse(decodeURIComponent(userParam));
        login(userData);
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        console.error('OAuth callback error:', error);
      }
    }
  };

  /**
   * Validate access token
   */
  const validateToken = async (token) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Token invalid');
      }

      // Token is valid, could refresh user data here
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      clearAuth();
      return false;
    }
  };

  /**
   * Login with user data
   */
  const login = (userData, token = null) => {
    setUser(userData);
    setIsAuthenticated(true);
    
    if (token) {
      setAccessToken(token);
      localStorage.setItem('spotify_access_token', token);
    }
    
    localStorage.setItem('echotune_user', JSON.stringify(userData));
    
    console.log('User logged in:', userData.display_name || userData.id);
  };

  /**
   * Logout and clear authentication
   */
  const logout = () => {
    clearAuth();
    console.log('User logged out');
  };

  /**
   * Clear authentication data
   */
  const clearAuth = () => {
    setUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('echotune_user');
    localStorage.removeItem('spotify_access_token');
  };

  /**
   * Initiate Spotify OAuth flow
   */
  const initiateSpotifyAuth = () => {
    window.location.href = '/auth/spotify';
  };

  /**
   * Update user data
   */
  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
    localStorage.setItem('echotune_user', JSON.stringify({ ...user, ...userData }));
  };

  /**
   * Set new access token
   */
  const updateAccessToken = (token) => {
    setAccessToken(token);
    localStorage.setItem('spotify_access_token', token);
  };

  const value = {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    login,
    logout,
    clearAuth,
    initiateSpotifyAuth,
    updateUser,
    updateAccessToken,
    validateToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};