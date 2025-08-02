// React is needed for JSX
import { createContext, useContext, useState, useEffect } from 'react';

const DatabaseContext = createContext();

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

export function DatabaseProvider({ children }) {
  const [connectionStatus, setConnectionStatus] = useState({
    mongodb: { connected: false, status: 'unknown' },
    supabase: { connected: false, status: 'unknown' },
    sqlite: { connected: false, status: 'unknown' }
  });
  const [activeDatabases, setActiveDatabases] = useState([]);
  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    checkDatabaseConnections();
  }, []);

  const checkDatabaseConnections = async () => {
    try {
      const response = await fetch('/api/database/status');
      const data = await response.json();
      
      if (data.success) {
        setConnectionStatus(data.connections);
        setActiveDatabases(data.active);
        setFallbackMode(data.fallbackMode);
      }
    } catch (error) {
      console.error('Database status check failed:', error);
      // Assume fallback mode if check fails
      setFallbackMode(true);
      setConnectionStatus(prev => ({
        ...prev,
        sqlite: { connected: true, status: 'fallback' }
      }));
      setActiveDatabases(['sqlite']);
    }
  };

  const initializeFallbackDatabase = async () => {
    try {
      const response = await fetch('/api/database/init-fallback', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setFallbackMode(true);
        setConnectionStatus(prev => ({
          ...prev,
          sqlite: { connected: true, status: 'active' }
        }));
        setActiveDatabases(['sqlite']);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Fallback database initialization failed:', error);
      return false;
    }
  };

  const saveUserData = async (userData) => {
    try {
      const response = await fetch('/api/database/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
      });
      
      return await response.json();
    } catch (error) {
      console.error('Save user data failed:', error);
      return { success: false, error: error.message };
    }
  };

  const saveListeningHistory = async (historyData) => {
    try {
      const response = await fetch('/api/database/listening-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(historyData)
      });
      
      return await response.json();
    } catch (error) {
      console.error('Save listening history failed:', error);
      return { success: false, error: error.message };
    }
  };

  const getRecommendations = async (userId, options = {}) => {
    try {
      const queryParams = new URLSearchParams({
        userId,
        ...options
      });
      
      const response = await fetch(`/api/database/recommendations?${queryParams}`);
      return await response.json();
    } catch (error) {
      console.error('Get recommendations failed:', error);
      return { success: false, error: error.message };
    }
  };

  const getAnalytics = async (userId, options = {}) => {
    try {
      const queryParams = new URLSearchParams({
        userId,
        ...options
      });
      
      const response = await fetch(`/api/database/analytics?${queryParams}`);
      return await response.json();
    } catch (error) {
      console.error('Get analytics failed:', error);
      return { success: false, error: error.message };
    }
  };

  const isConnected = (database) => {
    return connectionStatus[database]?.connected || false;
  };

  const hasActiveDatabase = () => {
    return activeDatabases.length > 0;
  };

  const getActiveDatabase = () => {
    return activeDatabases[0] || null;
  };

  const value = {
    connectionStatus,
    activeDatabases,
    fallbackMode,
    checkDatabaseConnections,
    initializeFallbackDatabase,
    saveUserData,
    saveListeningHistory,
    getRecommendations,
    getAnalytics,
    isConnected,
    hasActiveDatabase,
    getActiveDatabase
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}