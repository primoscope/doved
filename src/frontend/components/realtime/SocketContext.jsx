import { createContext, useContext, useState, useEffect } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

/**
 * Socket.IO Context Provider for Real-time Communication
 * 
 * Provides WebSocket connection management and real-time features:
 * - Chat messaging with streaming responses
 * - Live provider switching
 * - Real-time notifications
 * - Connection health monitoring
 */
export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Set());

  useEffect(() => {
    // Initialize Socket.IO connection
    const newSocket = io('/', {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('🔗 Connected to Socket.IO server');
      setIsConnected(true);
      setConnectionError(null);
      setSocket(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from Socket.IO server:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionError(error.message);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectionError(null);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('❌ Failed to reconnect to Socket.IO server');
      setConnectionError('Connection failed');
    });

    // Session management
    newSocket.on('session_created', (data) => {
      setCurrentSessionId(data.sessionId);
      console.log('Session created:', data.sessionId);
    });

    // Typing indicators
    newSocket.on('typing_start', (data) => {
      setTypingUsers(prev => new Set([...prev, data.userId]));
    });

    newSocket.on('typing_stop', (data) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    // Initialize connection
    newSocket.connect();

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  /**
   * Send a chat message via Socket.IO
   */
  const sendMessage = (message, provider = 'mock', userId = 'demo_user') => {
    if (!socket || !isConnected) {
      throw new Error('Socket not connected');
    }

    socket.emit('chat_message', {
      message,
      sessionId: currentSessionId,
      provider,
      userId,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * Switch LLM provider
   */
  const switchProvider = (provider) => {
    if (!socket || !isConnected) {
      throw new Error('Socket not connected');
    }

    socket.emit('switch_provider', { provider });
  };

  /**
   * Send typing indicator
   */
  const sendTyping = (isTyping, userId = 'demo_user') => {
    if (!socket || !isConnected) return;

    socket.emit(isTyping ? 'typing_start' : 'typing_stop', {
      userId,
      sessionId: currentSessionId
    });
  };

  /**
   * Join a specific room (for future group features)
   */
  const joinRoom = (roomId) => {
    if (!socket || !isConnected) return;

    socket.emit('join_room', { roomId });
  };

  const value = {
    socket,
    isConnected,
    connectionError,
    currentSessionId,
    typingUsers,
    sendMessage,
    switchProvider,
    sendTyping,
    joinRoom
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};