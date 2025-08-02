// React is needed for JSX
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    setLoading(true);
    try {
      // Check for stored user data
      const storedUser = localStorage.getItem('echotune_user');
      const storedToken = localStorage.getItem('echotune_token');
      
      if (storedUser && storedToken) {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setAccessToken(storedToken);
      }
      
      // Verify token validity with backend
      const response = await fetch('/api/auth/status', {
        headers: {
          Authorization: `Bearer ${storedToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          setAccessToken(data.accessToken);
          localStorage.setItem('echotune_user', JSON.stringify(data.user));
          localStorage.setItem('echotune_token', data.accessToken);
        }
      } else {
        // Token invalid, clear storage
        localStorage.removeItem('echotune_user');
        localStorage.removeItem('echotune_token');
        setUser(null);
        setAccessToken(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      // In case of error, check local storage only
      const storedUser = localStorage.getItem('echotune_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          localStorage.removeItem('echotune_user');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    window.location.href = '/auth/spotify';
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('echotune_user');
      localStorage.removeItem('echotune_token');
    }
  };

  const refreshToken = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('echotune_token', data.accessToken);
        return data.accessToken;
      } else {
        // Refresh failed, logout user
        logout();
        return null;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      logout();
      return null;
    }
  };

  const value = {
    user,
    accessToken,
    loading,
    login,
    logout,
    refreshToken,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}