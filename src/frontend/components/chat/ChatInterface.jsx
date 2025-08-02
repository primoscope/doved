import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../realtime/SocketContext';
import { useAuth } from '../auth/AuthContext';
import { useSpotifyPlayer } from '../player/SpotifyPlayerContext';
import VoiceInterface from './VoiceInterface';
import ProviderSwitcher from './ProviderSwitcher';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import './ChatInterface.css';

/**
 * Enhanced Chat Interface Component
 * 
 * Features:
 * - Real-time messaging via Socket.IO
 * - Voice input/output capabilities
 * - Provider switching for different LLM models
 * - Music player integration
 * - Typing indicators
 * - Message streaming
 */
const ChatInterface = () => {
  const { socket, isConnected, sendMessage, sendTyping } = useSocket();
  const { user } = useAuth();
  const { playTrack, searchTracks } = useSpotifyPlayer();
  
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentProvider, setCurrentProvider] = useState('mock');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [_voiceEnabled, setVoiceEnabled] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Text-to-Speech functionality
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(null);

  useEffect(() => {
    // Initialize welcome message
    setMessages([{
      id: 'welcome',
      sender: 'assistant',
      content: `Hello! I'm your AI music assistant powered by advanced language models. I can help you discover new music, create playlists, and find the perfect songs for any mood or activity.

**Try asking me:**
• "Recommend some upbeat songs for working out"
• "Create a chill playlist for studying"  
• "I'm feeling nostalgic, what should I listen to?"
• "Analyze my music taste and suggest similar artists"`,
      timestamp: new Date(),
      provider: currentProvider
    }]);

    // Initialize Text-to-Speech
    initializeTTS();
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Socket event handlers
    socket.on('chat_response', handleChatResponse);
    socket.on('stream_start', handleStreamStart);
    socket.on('stream_chunk', handleStreamChunk);
    socket.on('stream_complete', handleStreamComplete);
    socket.on('provider_switched', handleProviderSwitch);
    socket.on('typing_start', () => setIsTyping(true));
    socket.on('typing_stop', () => setIsTyping(false));

    return () => {
      socket.off('chat_response');
      socket.off('stream_start');
      socket.off('stream_chunk');
      socket.off('stream_complete');
      socket.off('provider_switched');
      socket.off('typing_start');
      socket.off('typing_stop');
    };
  }, [socket]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  /**
   * Initialize Text-to-Speech
   */
  const initializeTTS = () => {
    if ('speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices();
      // Prefer female voices for music assistant
      const preferredVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') || 
        voice.name.toLowerCase().includes('samantha') ||
        voice.name.toLowerCase().includes('kate')
      ) || voices[0];
      
      setTtsVoice(preferredVoice);
      setVoiceEnabled(true);
      
      // Handle voice loading
      speechSynthesis.onvoiceschanged = () => {
        const updatedVoices = speechSynthesis.getVoices();
        const updatedPreferred = updatedVoices.find(voice => 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('samantha') ||
          voice.name.toLowerCase().includes('kate')
        ) || updatedVoices[0];
        setTtsVoice(updatedPreferred);
      };
    }
  };

  /**
   * Speak text using Text-to-Speech
   */
  const speakText = (text) => {
    if (!ttsEnabled || !ttsVoice || !text) return;

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    // Clean text for speech (remove markdown, emojis, etc.)
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/•/g, '')
      .trim();

    if (cleanText.length > 0) {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.voice = ttsVoice;
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;

      utterance.onstart = () => {
        console.log('🗣️ TTS started');
      };

      utterance.onend = () => {
        console.log('🗣️ TTS completed');
      };

      utterance.onerror = (error) => {
        console.error('TTS error:', error);
      };

      speechSynthesis.speak(utterance);
    }
  };

  /**
   * Handle chat response from server
   */
  const handleChatResponse = (data) => {
    const newMessage = {
      id: Date.now() + Math.random(),
      sender: 'assistant',
      content: data.response,
      timestamp: new Date(),
      provider: data.provider || currentProvider
    };

    setMessages(prev => [...prev, newMessage]);
    setIsTyping(false);

    // Speak the response if TTS is enabled
    if (ttsEnabled) {
      speakText(data.response);
    }

    // Handle music-related actions
    handleMusicActions(data);
  };

  /**
   * Handle streaming message start
   */
  const handleStreamStart = () => {
    setStreamingMessage('');
    setIsTyping(true);
  };

  /**
   * Handle streaming message chunk
   */
  const handleStreamChunk = (data) => {
    setStreamingMessage(prev => prev + data.content);
  };

  /**
   * Handle streaming message complete
   */
  const handleStreamComplete = (data) => {
    const newMessage = {
      id: Date.now() + Math.random(),
      sender: 'assistant',
      content: streamingMessage,
      timestamp: new Date(),
      provider: data.provider || currentProvider
    };

    setMessages(prev => [...prev, newMessage]);
    setStreamingMessage('');
    setIsTyping(false);

    // Speak the complete response if TTS is enabled
    if (ttsEnabled) {
      speakText(streamingMessage);
    }

    // Handle music-related actions
    handleMusicActions(data);
  };

  /**
   * Handle provider switch
   */
  const handleProviderSwitch = (data) => {
    setCurrentProvider(data.provider);
    
    const systemMessage = {
      id: Date.now() + Math.random(),
      sender: 'system',
      content: data.message,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, systemMessage]);
  };

  /**
   * Handle music-related actions from AI response
   */
  const handleMusicActions = async (data) => {
    if (data.action === 'play_track' && data.trackUri) {
      try {
        const success = await playTrack(data.trackUri);
        if (success) {
          const musicMessage = {
            id: Date.now() + Math.random(),
            sender: 'system',
            content: `🎵 Now playing: ${data.trackName || 'Track'}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, musicMessage]);
        }
      } catch (error) {
        console.error('Play track error:', error);
      }
    }

    if (data.action === 'search_music' && data.query) {
      try {
        const tracks = await searchTracks(data.query, 5);
        if (tracks.length > 0) {
          const searchMessage = {
            id: Date.now() + Math.random(),
            sender: 'system',
            content: `🔍 Found ${tracks.length} tracks for "${data.query}"`,
            timestamp: new Date(),
            tracks: tracks
          };
          setMessages(prev => [...prev, searchMessage]);
        }
      } catch (error) {
        console.error('Search tracks error:', error);
      }
    }
  };

  /**
   * Send a message
   */
  const handleSendMessage = async (message) => {
    if (!message.trim() || !isConnected) return;

    // Add user message to chat
    const userMessage = {
      id: Date.now() + Math.random(),
      sender: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');

    try {
      // Send message via Socket.IO
      sendMessage(message, currentProvider, user?.id || 'demo_user');
      setIsTyping(true);
    } catch (error) {
      console.error('Send message error:', error);
      
      // Fallback to API if Socket.IO fails
      try {
        const response = await fetch('/api/chat/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            provider: currentProvider
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          const assistantMessage = {
            id: Date.now() + Math.random(),
            sender: 'assistant',
            content: data.response,
            timestamp: new Date(),
            provider: currentProvider
          };
          setMessages(prev => [...prev, assistantMessage]);
          
          if (ttsEnabled) {
            speakText(data.response);
          }
        }
      } catch (apiError) {
        console.error('API fallback error:', apiError);
        
        const errorMessage = {
          id: Date.now() + Math.random(),
          sender: 'system',
          content: 'Sorry, I seem to be having connection issues. Please try again.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      
      setIsTyping(false);
    }
  };

  /**
   * Handle typing indicator
   */
  const handleTyping = (typing) => {
    sendTyping(typing, user?.id || 'demo_user');

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (typing) {
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false, user?.id || 'demo_user');
      }, 3000);
    }
  };

  /**
   * Toggle TTS on/off
   */
  const toggleTTS = () => {
    setTtsEnabled(!ttsEnabled);
    
    if (!ttsEnabled) {
      // Cancel any ongoing speech when enabling
      speechSynthesis.cancel();
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">🎵</span>
          <div>
            <h2>Music Assistant</h2>
            <p>Ask me for music recommendations, playlist creation, or mood-based suggestions</p>
          </div>
          <div className="chat-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              <span className="status-dot"></span>
              {isConnected ? 'AI Ready' : 'Connecting...'}
            </span>
          </div>
        </div>
        
        <div className="chat-controls">
          <ProviderSwitcher 
            currentProvider={currentProvider}
            onProviderChange={setCurrentProvider}
          />
          
          <button 
            className={`tts-toggle ${ttsEnabled ? 'enabled' : ''}`}
            onClick={toggleTTS}
            title={`${ttsEnabled ? 'Disable' : 'Enable'} voice responses`}
          >
            🗣️
          </button>
          
          <button 
            className={`voice-toggle ${showVoiceInterface ? 'active' : ''}`}
            onClick={() => setShowVoiceInterface(!showVoiceInterface)}
            title="Voice interface"
          >
            🎤
          </button>
        </div>
      </div>

      {showVoiceInterface && (
        <VoiceInterface 
          onVoiceInput={handleSendMessage}
          onClose={() => setShowVoiceInterface(false)}
        />
      )}

      <MessageList 
        messages={messages}
        streamingMessage={streamingMessage}
        isTyping={isTyping}
        onPlayTrack={playTrack}
      />

      <ChatInput 
        value={currentMessage}
        onChange={setCurrentMessage}
        onSend={handleSendMessage}
        onTyping={handleTyping}
        disabled={!isConnected}
        isTyping={isTyping}
      />

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatInterface;