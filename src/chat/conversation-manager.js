const { v4: uuidv4 } = require('uuid');
const mongoManager = require('../database/mongodb');

/**
 * Enhanced Conversation Manager for EchoTune AI
 * Handles chat sessions, message history, context management, and conversation summarization
 */
class ConversationManager {
  constructor() {
    this.activeSessions = new Map();
    this.maxSessionHistory = 50;
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.contextMemoryLimit = 10; // Messages to keep in active context
    this.summaryThreshold = 20; // When to create conversation summaries
  }

  /**
   * Start a new conversation session with enhanced context
   */
  async startSession(userId, options = {}) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      userId,
      startTime: new Date(),
      lastActivity: new Date(),
      messages: [],
      context: {
        userProfile: null,
        currentPlaylist: null,
        lastRecommendations: null,
        musicPreferences: {},
        conversationGoals: [],
        conversationSummary: null,
        currentTopic: null,
        userIntent: null,
        musicContext: {
          currentMood: null,
          preferredGenres: [],
          recentlyDiscussed: [],
          playlistsInProgress: []
        },
        sessionMemory: {
          importantFacts: [],
          userFeedback: [],
          preferences: {}
        },
        ...options.context
      },
      metadata: {
        llmProvider: options.llmProvider || 'mock',
        model: options.model || this.getDefaultModelForProvider(options.llmProvider || 'mock'),
        language: options.language || 'en',
        sessionType: options.sessionType || 'general',
        contextVersion: 1,
        lastSummaryIndex: 0
      }
    };

    // Load user context and previous conversation insights
    await this.loadUserContext(session);
    await this.loadConversationInsights(session);

    this.activeSessions.set(sessionId, session);
    
    // Save to database
    await this.saveSessionToDatabase(session);

    console.log(`🆕 Started new conversation session ${sessionId} for user ${userId}`);
    return session;
  }

  /**
   * Get existing session or create new one
   */
  async getOrCreateSession(userId, sessionId = null, options = {}) {
    if (sessionId && this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      if (session.userId === userId) {
        session.lastActivity = new Date();
        return session;
      }
    }

    // Try to load from database if sessionId provided
    if (sessionId) {
      const dbSession = await this.loadSessionFromDatabase(sessionId, userId);
      if (dbSession) {
        this.activeSessions.set(sessionId, dbSession);
        return dbSession;
      }
    }

    // Create new session
    return await this.startSession(userId, options);
  }

  /**
   * Add message to conversation with enhanced context tracking
   */
  async addMessage(sessionId, message, options = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messageObj = {
      id: uuidv4(),
      role: message.role,
      content: message.content,
      timestamp: new Date(),
      metadata: {
        tokens: options.tokens || 0,
        model: options.model || session.metadata.model,
        responseTime: options.responseTime || 0,
        intent: options.intent || null,
        confidence: options.confidence || 0,
        entities: options.entities || [],
        ...options.metadata
      }
    };

    session.messages.push(messageObj);
    session.lastActivity = new Date();

    // Update conversation context based on message
    await this.updateConversationContext(session, messageObj);

    // Check if we need to summarize old messages
    if (session.messages.length > this.summaryThreshold && 
        session.messages.length - session.metadata.lastSummaryIndex > this.summaryThreshold) {
      await this.createConversationSummary(session);
    }

    // Trim old messages if exceeding limit
    if (session.messages.length > this.maxSessionHistory) {
      await this.trimSessionHistory(session);
    }

    // Save to database
    await this.saveMessageToDatabase(sessionId, messageObj);

    return messageObj;
  }

  /**
   * Update conversation context based on new message
   */
  async updateConversationContext(session, message) {
    try {
      // Extract music-related entities and intent
      const musicEntities = this.extractMusicEntities(message.content);
      const intent = this.detectUserIntent(message.content, message.role);

      if (message.role === 'user') {
        // Update user intent and current topic
        if (intent) {
          session.context.userIntent = intent;
        }

        // Track music-related mentions
        if (musicEntities.genres?.length > 0) {
          session.context.musicContext.recentlyDiscussed = [
            ...new Set([...session.context.musicContext.recentlyDiscussed, ...musicEntities.genres])
          ].slice(-10);
        }

        if (musicEntities.artists?.length > 0) {
          session.context.musicContext.recentlyDiscussed = [
            ...new Set([...session.context.musicContext.recentlyDiscussed, ...musicEntities.artists])
          ].slice(-10);
        }

        // Detect mood indicators
        const mood = this.detectMood(message.content);
        if (mood) {
          session.context.musicContext.currentMood = mood;
        }
      }

      // Store important facts for future reference
      if (message.role === 'assistant' && message.metadata.entities?.length > 0) {
        session.context.sessionMemory.importantFacts.push({
          timestamp: message.timestamp,
          content: message.content,
          entities: message.metadata.entities
        });
        
        // Keep only recent important facts
        session.context.sessionMemory.importantFacts = 
          session.context.sessionMemory.importantFacts.slice(-20);
      }

    } catch (error) {
      console.error('Error updating conversation context:', error);
    }
  }

  /**
   * Extract music-related entities from text
   */
  extractMusicEntities(text) {
    const entities = {
      genres: [],
      artists: [],
      songs: [],
      moods: [],
      activities: []
    };

    // Simple pattern matching for genres
    const genrePatterns = [
      /\b(rock|pop|jazz|classical|electronic|hip[- ]?hop|country|folk|blues|reggae|metal|punk|indie|alternative)\b/gi,
      /\b(r&b|rnb|soul|funk|disco|house|techno|dubstep|trap|lo[- ]?fi)\b/gi
    ];

    genrePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.genres.push(...matches.map(m => m.toLowerCase()));
      }
    });

    // Mood indicators
    const moodPatterns = /\b(happy|sad|energetic|calm|chill|upbeat|melancholy|angry|peaceful|excited|relaxed|nostalgic)\b/gi;
    const moodMatches = text.match(moodPatterns);
    if (moodMatches) {
      entities.moods.push(...moodMatches.map(m => m.toLowerCase()));
    }

    // Activity indicators
    const activityPatterns = /\b(workout|working out|exercise|study|studying|work|working|sleep|sleeping|party|driving|cooking|cleaning)\b/gi;
    const activityMatches = text.match(activityPatterns);
    if (activityMatches) {
      entities.activities.push(...activityMatches.map(m => m.toLowerCase()));
    }

    return entities;
  }

  /**
   * Detect user intent from message
   */
  detectUserIntent(text, role) {
    if (role !== 'user') return null;

    const intentPatterns = {
      'recommend': /\b(recommend|suggest|find|discover|what should i listen to|any suggestions)\b/i,
      'create_playlist': /\b(create|make|build|playlist|mix)\b/i,
      'analyze': /\b(analyze|analysis|insights|stats|statistics|habits|taste)\b/i,
      'search': /\b(search|look for|find|who is|what is)\b/i,
      'mood_based': /\b(i'm feeling|mood|vibe|atmosphere)\b/i,
      'activity_based': /\b(for (working out|studying|work|sleep|party|driving))\b/i
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(text)) {
        return intent;
      }
    }

    return 'general';
  }

  /**
   * Detect mood from text
   */
  detectMood(text) {
    const moodMap = {
      'happy': ['happy', 'joyful', 'cheerful', 'upbeat', 'positive'],
      'sad': ['sad', 'melancholy', 'down', 'depressed', 'blue'],
      'energetic': ['energetic', 'pumped', 'excited', 'hyped', 'motivated'],
      'calm': ['calm', 'peaceful', 'relaxed', 'chill', 'zen'],
      'nostalgic': ['nostalgic', 'reminiscent', 'throwback', 'memories'],
      'romantic': ['romantic', 'love', 'intimate', 'romantic'],
      'angry': ['angry', 'frustrated', 'mad', 'aggressive']
    };

    const textLower = text.toLowerCase();
    
    for (const [mood, keywords] of Object.entries(moodMap)) {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        return mood;
      }
    }

    return null;
  }

  /**
   * Create conversation summary for long conversations
   */
  async createConversationSummary(session) {
    try {
      const messagesToSummarize = session.messages.slice(session.metadata.lastSummaryIndex, -this.contextMemoryLimit);
      
      if (messagesToSummarize.length < 5) return; // Not enough to summarize

      const summary = this.generateConversationSummary(messagesToSummarize, session.context);
      
      // Store summary in context
      session.context.conversationSummary = summary;
      session.metadata.lastSummaryIndex = session.messages.length - this.contextMemoryLimit;
      
      console.log(`📝 Created conversation summary for session ${session.sessionId}`);
      
      // Save summary to database
      await this.saveConversationSummary(session.sessionId, summary);
      
    } catch (error) {
      console.error('Error creating conversation summary:', error);
    }
  }

  /**
   * Generate a concise summary of conversation messages
   */
  generateConversationSummary(messages, context) {
    const topics = new Set();
    const recommendations = [];
    const userPreferences = [];
    const playlists = [];

    messages.forEach(msg => {
      if (msg.role === 'user') {
        // Extract topics and preferences from user messages
        const entities = this.extractMusicEntities(msg.content);
        entities.genres.forEach(g => topics.add(g));
        entities.moods.forEach(m => topics.add(m));
        entities.activities.forEach(a => topics.add(a));
        
        if (msg.content.includes('like') || msg.content.includes('love') || msg.content.includes('prefer')) {
          userPreferences.push(msg.content.substring(0, 100));
        }
      } else if (msg.role === 'assistant') {
        // Track recommendations and playlist creations
        if (msg.content.includes('recommend') || msg.content.includes('suggest')) {
          recommendations.push(msg.content.substring(0, 150));
        }
        if (msg.content.includes('playlist') && msg.content.includes('created')) {
          playlists.push(msg.content.substring(0, 100));
        }
      }
    });

    return {
      timestamp: new Date(),
      messageCount: messages.length,
      topics: Array.from(topics).slice(0, 10),
      recommendations: recommendations.slice(0, 3),
      userPreferences: userPreferences.slice(0, 3),
      playlists: playlists.slice(0, 3),
      mainIntent: context.userIntent || 'general',
      currentMood: context.musicContext?.currentMood
    };
  }

  /**
   * Trim session history while preserving important context
   */
  async trimSessionHistory(session) {
    const systemMessages = session.messages.filter(m => m.role === 'system');
    const otherMessages = session.messages.filter(m => m.role !== 'system');
    
    // Keep recent messages and ensure we maintain conversational flow
    const keepCount = this.maxSessionHistory - systemMessages.length - 5; // Reserve space for system messages
    const recentMessages = otherMessages.slice(-keepCount);
    
    // Ensure we don't break mid-conversation
    let startIndex = 0;
    for (let i = 0; i < recentMessages.length; i++) {
      if (recentMessages[i].role === 'user') {
        startIndex = i;
        break;
      }
    }
    
    session.messages = [
      ...systemMessages,
      ...recentMessages.slice(startIndex)
    ];
    
    console.log(`✂️ Trimmed session history for ${session.sessionId}, kept ${session.messages.length} messages`);
  }

  /**
   * Load conversation insights from previous sessions
   */
  async loadConversationInsights(session) {
    try {
      const db = mongoManager.getDb();
      const summariesCollection = db.collection('conversation_summaries');
      
      // Load recent conversation summaries for this user
      const recentSummaries = await summariesCollection
        .find({ user_id: session.userId })
        .sort({ timestamp: -1 })
        .limit(5)
        .toArray();

      if (recentSummaries.length > 0) {
        // Extract insights from previous conversations
        const combinedTopics = new Set();
        const combinedPreferences = [];
        
        recentSummaries.forEach(summary => {
          if (summary.data.topics) {
            summary.data.topics.forEach(topic => combinedTopics.add(topic));
          }
          if (summary.data.userPreferences) {
            combinedPreferences.push(...summary.data.userPreferences);
          }
        });

        session.context.sessionMemory.historicalTopics = Array.from(combinedTopics);
        session.context.sessionMemory.historicalPreferences = combinedPreferences.slice(0, 10);
      }

    } catch (error) {
      console.error('Error loading conversation insights:', error);
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(sessionId, options = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return [];
    }

    const { limit = 20, excludeSystem = false } = options;
    let messages = session.messages;

    if (excludeSystem) {
      messages = messages.filter(m => m.role !== 'system');
    }

    return messages.slice(-limit);
  }

  /**
   * Update session context
   */
  async updateSessionContext(sessionId, contextUpdate) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.context = {
      ...session.context,
      ...contextUpdate
    };

    session.lastActivity = new Date();

    // Save context update to database
    await this.updateSessionInDatabase(sessionId, { context: session.context });

    return session.context;
  }

  /**
   * Load user context for session
   */
  async loadUserContext(session) {
    try {
      const db = mongoManager.getDb();
      
      // Load user profile
      const userProfileCollection = db.collection('user_profiles');
      const userProfile = await userProfileCollection.findOne({ _id: session.userId });
      
      if (userProfile) {
        session.context.userProfile = userProfile;
        session.context.musicPreferences = userProfile.preferences || {};
      }

      // Load recent listening history
      const listeningHistoryCollection = db.collection('listening_history');
      const recentHistory = await listeningHistoryCollection
        .find({ user_id: session.userId })
        .sort({ played_at: -1 })
        .limit(20)
        .toArray();

      session.context.recentListeningHistory = recentHistory;

      // Load recent recommendations
      const recommendationsCollection = db.collection('recommendations');
      const recentRecommendations = await recommendationsCollection
        .findOne(
          { user_id: session.userId },
          { sort: { created_at: -1 } }
        );

      if (recentRecommendations) {
        session.context.lastRecommendations = recentRecommendations;
      }

    } catch (error) {
      console.error('Error loading user context:', error);
    }
  }

  /**
   * Get messages formatted for LLM
   */
  getMessagesForLLM(sessionId, options = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return [];
    }

    const { includeContext = true, maxMessages = 10 } = options;
    
    let messages = [];

    // Add system message with context
    if (includeContext) {
      const systemMessage = this.buildSystemMessage(session);
      messages.push(systemMessage);
    }

    // Add conversation history
    const history = this.getConversationHistory(sessionId, { 
      limit: maxMessages,
      excludeSystem: true 
    });

    messages.push(...history.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    return messages;
  }

  /**
   * Build enhanced system message with comprehensive user context
   */
  buildSystemMessage(session) {
    const context = session.context;
    let systemContent = `You are EchoTune AI, an intelligent music assistant that helps users discover new music, create playlists, and explore their musical tastes. You provide personalized, conversational, and enthusiastic responses about music.

Current user context:`;

    if (context.userProfile) {
      systemContent += `\n- User: ${context.userProfile.display_name}`;
      if (context.userProfile.preferences?.favorite_genres?.length > 0) {
        systemContent += `\n- Favorite genres: ${context.userProfile.preferences.favorite_genres.join(', ')}`;
      }
    }

    // Add recent listening context
    if (context.recentListeningHistory?.length > 0) {
      const recentTracks = context.recentListeningHistory.slice(0, 3);
      systemContent += `\n- Recent tracks: ${recentTracks.map(t => `${t.track_name} by ${t.artist_name}`).join(', ')}`;
    }

    // Add conversation-specific context
    if (context.userIntent) {
      systemContent += `\n- Current intent: ${context.userIntent}`;
    }

    if (context.musicContext?.currentMood) {
      systemContent += `\n- Current mood: ${context.musicContext.currentMood}`;
    }

    if (context.musicContext?.recentlyDiscussed?.length > 0) {
      systemContent += `\n- Recently discussed: ${context.musicContext.recentlyDiscussed.slice(0, 5).join(', ')}`;
    }

    // Add conversation summary if available
    if (context.conversationSummary) {
      systemContent += `\n- Previous conversation topics: ${context.conversationSummary.topics?.join(', ') || 'general music discussion'}`;
      if (context.conversationSummary.userPreferences?.length > 0) {
        systemContent += `\n- User has expressed: ${context.conversationSummary.userPreferences[0]}`;
      }
    }

    // Add historical insights
    if (context.sessionMemory?.historicalTopics?.length > 0) {
      systemContent += `\n- Historical interests: ${context.sessionMemory.historicalTopics.slice(0, 5).join(', ')}`;
    }

    if (context.lastRecommendations) {
      systemContent += `\n- Last recommendation type: ${context.lastRecommendations.recommendation_type}`;
    }

    systemContent += `

Guidelines:
- Be conversational, helpful, and enthusiastic about music
- Use the context to provide personalized recommendations and responses
- Remember previous parts of this conversation and build upon them
- Ask follow-up questions to better understand user preferences
- Provide specific song, artist, or playlist recommendations when appropriate
- If creating playlists, give them creative names and explain your choices`;

    return {
      role: 'system',
      content: systemContent
    };
  }

  /**
   * Save conversation summary to database
   */
  async saveConversationSummary(sessionId, summary) {
    try {
      const db = mongoManager.getDb();
      const summariesCollection = db.collection('conversation_summaries');
      const session = this.activeSessions.get(sessionId);
      
      await summariesCollection.insertOne({
        _id: uuidv4(),
        user_id: session.userId,
        session_id: sessionId,
        timestamp: summary.timestamp,
        data: summary
      });

    } catch (error) {
      console.error('Error saving conversation summary:', error);
    }
  }

  /**
   * Get contextual recommendations based on conversation
   */
  getContextualHints(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return [];

    const hints = [];
    const context = session.context;

    // Suggest based on current mood
    if (context.musicContext?.currentMood) {
      hints.push(`Continue exploring ${context.musicContext.currentMood} music`);
    }

    // Suggest based on recent topics
    if (context.musicContext?.recentlyDiscussed?.length > 0) {
      const recent = context.musicContext.recentlyDiscussed[0];
      hints.push(`More about ${recent}`);
    }

    // Suggest based on user intent
    if (context.userIntent === 'create_playlist') {
      hints.push('Finish creating your playlist');
    } else if (context.userIntent === 'recommend') {
      hints.push('Get more recommendations');
    }

    // Default suggestions
    if (hints.length === 0) {
      hints.push('Ask for music recommendations', 'Create a new playlist', 'Analyze your music taste');
    }

    return hints.slice(0, 4);
  }

  /**
   * Update user feedback and preferences
   */
  async recordUserFeedback(sessionId, feedback) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const feedbackObj = {
      timestamp: new Date(),
      type: feedback.type, // 'like', 'dislike', 'rating', etc.
      target: feedback.target, // 'recommendation', 'playlist', 'song', etc.
      value: feedback.value,
      context: feedback.context || {}
    };

    session.context.sessionMemory.userFeedback.push(feedbackObj);
    
    // Keep only recent feedback
    session.context.sessionMemory.userFeedback = 
      session.context.sessionMemory.userFeedback.slice(-20);

    // Update preferences based on feedback
    if (feedback.type === 'like' && feedback.target === 'genre') {
      const genre = feedback.value;
      if (!session.context.sessionMemory.preferences.genres) {
        session.context.sessionMemory.preferences.genres = {};
      }
      session.context.sessionMemory.preferences.genres[genre] = 
        (session.context.sessionMemory.preferences.genres[genre] || 0) + 1;
    }

    await this.updateSessionContext(sessionId, { sessionMemory: session.context.sessionMemory });
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    const expiredSessions = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const timeSinceActivity = now - session.lastActivity;
      if (timeSinceActivity > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      console.log(`🧹 Cleaning up expired session ${sessionId}`);
      this.activeSessions.delete(sessionId);
    });

    return expiredSessions.length;
  }

  /**
   * Save session to database
   */
  async saveSessionToDatabase(session) {
    try {
      const db = mongoManager.getDb();
      const chatSessionsCollection = db.collection('chat_sessions');
      
      await chatSessionsCollection.insertOne({
        _id: session.sessionId,
        user_id: session.userId,
        start_time: session.startTime,
        last_activity: session.lastActivity,
        context: session.context,
        metadata: session.metadata,
        message_count: session.messages.length
      });

    } catch (error) {
      console.error('Error saving session to database:', error);
    }
  }

  /**
   * Load session from database
   */
  async loadSessionFromDatabase(sessionId, userId) {
    try {
      const db = mongoManager.getDb();
      const chatSessionsCollection = db.collection('chat_sessions');
      const chatHistoryCollection = db.collection('chat_history');
      
      const sessionData = await chatSessionsCollection.findOne({
        _id: sessionId,
        user_id: userId
      });

      if (!sessionData) {
        return null;
      }

      // Load messages
      const messages = await chatHistoryCollection
        .find({ session_id: sessionId })
        .sort({ timestamp: 1 })
        .toArray();

      const session = {
        sessionId: sessionData._id,
        userId: sessionData.user_id,
        startTime: sessionData.start_time,
        lastActivity: new Date(),
        messages: messages.map(msg => ({
          id: msg._id,
          role: msg.message_type,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata || {}
        })),
        context: sessionData.context || {},
        metadata: sessionData.metadata || {}
      };

      // Reload user context
      await this.loadUserContext(session);

      return session;

    } catch (error) {
      console.error('Error loading session from database:', error);
      return null;
    }
  }

  /**
   * Get default model for a specific provider
   */
  getDefaultModelForProvider(provider) {
    const defaultModels = {
      'openai': 'gpt-4o-mini',
      'gemini': 'gemini-1.5-flash', 
      'openrouter': 'deepseek/deepseek-r1-0528:free',
      'azure': 'gpt-35-turbo',
      'mock': 'mock-music-assistant'
    };
    
    return defaultModels[provider] || 'mock-music-assistant';
  }

  /**
   * Save message to database
   */
  async saveMessageToDatabase(sessionId, message) {
    try {
      const db = mongoManager.getDb();
      const chatHistoryCollection = db.collection('chat_history');
      const session = this.activeSessions.get(sessionId);
      
      await chatHistoryCollection.insertOne({
        _id: message.id,
        user_id: session.userId,
        session_id: sessionId,
        message_type: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata
      });

    } catch (error) {
      console.error('Error saving message to database:', error);
    }
  }

  /**
   * Update session in database
   */
  async updateSessionInDatabase(sessionId, updates) {
    try {
      const db = mongoManager.getDb();
      const chatSessionsCollection = db.collection('chat_sessions');
      
      await chatSessionsCollection.updateOne(
        { _id: sessionId },
        { 
          $set: {
            ...updates,
            last_activity: new Date()
          }
        }
      );

    } catch (error) {
      console.error('Error updating session in database:', error);
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    const userMessages = session.messages.filter(m => m.role === 'user');
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');
    const totalTokens = session.messages.reduce((sum, m) => sum + (m.metadata.tokens || 0), 0);

    return {
      sessionId,
      userId: session.userId,
      startTime: session.startTime,
      duration: new Date() - session.startTime,
      messageCount: session.messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      totalTokens,
      averageResponseTime: assistantMessages.reduce((sum, m) => sum + (m.metadata.responseTime || 0), 0) / assistantMessages.length || 0
    };
  }

  /**
   * Export conversation for user
   */
  async exportConversation(sessionId, format = 'json') {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exportData = {
      sessionId: session.sessionId,
      userId: session.userId,
      startTime: session.startTime,
      messages: session.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      stats: this.getSessionStats(sessionId)
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else if (format === 'text') {
      let text = `EchoTune AI Conversation\nSession: ${sessionId}\nDate: ${session.startTime.toISOString()}\n\n`;
      
      for (const msg of session.messages) {
        if (msg.role !== 'system') {
          text += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
        }
      }
      
      return text;
    }

    return exportData;
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMinutes = 15) {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, intervalMinutes * 60 * 1000);

    console.log(`🔄 Started periodic session cleanup (every ${intervalMinutes} minutes)`);
  }
}

module.exports = ConversationManager;