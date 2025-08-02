const OpenAIProvider = require('./llm-providers/openai-provider');
const GeminiProvider = require('./llm-providers/gemini-provider');
const CustomAPIProvider = require('./llm-providers/custom-provider');
const MockLLMProvider = require('./llm-providers/mock-provider');
const ConversationManager = require('./conversation-manager');
const recommendationEngine = require('../ml/recommendation-engine'); // Import the singleton instance
const SpotifyAudioFeaturesService = require('../spotify/audio-features');
const SpotifyAPIService = require('../spotify/api-service');

/**
 * Main Chatbot Class for EchoTune AI
 * Coordinates LLM providers, conversation management, and music functionality
 */
class EchoTuneChatbot {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.currentProvider = null;
    this.conversationManager = new ConversationManager();
    this.recommendationEngine = recommendationEngine; // Use the singleton instance
    this.spotifyService = new SpotifyAudioFeaturesService();
    this.spotifyAPI = new SpotifyAPIService();
    
    // Initialize providers based on config
    this.initializeProviders();
    
    // Start session cleanup
    this.conversationManager.startPeriodicCleanup();
  }

  /**
   * Initialize all available LLM providers
   */
  initializeProviders() {
    const providerConfigs = this.config.llmProviders || {};
    let hasConfiguredProvider = false;

    // OpenAI Provider
    if (providerConfigs.openai?.apiKey) {
      const openaiProvider = new OpenAIProvider(providerConfigs.openai);
      this.providers.set('openai', openaiProvider);
      hasConfiguredProvider = true;
    }

    // Gemini Provider
    if (providerConfigs.gemini?.apiKey) {
      const geminiProvider = new GeminiProvider(providerConfigs.gemini);
      this.providers.set('gemini', geminiProvider);
      hasConfiguredProvider = true;
    }

    // Azure OpenAI Provider
    if (providerConfigs.azure?.apiKey) {
      const azureConfig = CustomAPIProvider.createAzureConfig(providerConfigs.azure);
      const azureProvider = new CustomAPIProvider(azureConfig);
      this.providers.set('azure', azureProvider);
      hasConfiguredProvider = true;
    }

    // OpenRouter Provider
    if (providerConfigs.openrouter?.apiKey) {
      const openrouterConfig = CustomAPIProvider.createOpenRouterConfig(providerConfigs.openrouter);
      const openrouterProvider = new CustomAPIProvider(openrouterConfig);
      this.providers.set('openrouter', openrouterProvider);
      hasConfiguredProvider = true;
    }

    // Custom API Providers
    if (providerConfigs.custom && Array.isArray(providerConfigs.custom)) {
      providerConfigs.custom.forEach((customConfig, index) => {
        const config = CustomAPIProvider.createCustomConfig(customConfig);
        const customProvider = new CustomAPIProvider(config);
        this.providers.set(`custom_${index}`, customProvider);
        hasConfiguredProvider = true;
      });
    }

    // Add Mock Provider as fallback if no real providers are configured
    if (!hasConfiguredProvider || this.config.enableMockProvider) {
      const mockProvider = new MockLLMProvider({ enabledByDefault: !hasConfiguredProvider });
      this.providers.set('mock', mockProvider);
      console.log(`🎭 Mock provider added ${!hasConfiguredProvider ? '(no API keys configured)' : '(demo mode enabled)'}`);
    }

    // Set default provider
    this.currentProvider = this.config.defaultProvider || 
                          (hasConfiguredProvider ? 'openai' : 'mock');
    
    console.log(`🤖 Initialized ${this.providers.size} LLM providers`);
  }

  /**
   * Initialize all providers
   */
  async initialize() {
    const initPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        await provider.initialize();
        console.log(`✅ ${name} provider ready`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${name} provider:`, error.message);
      }
    });

    await Promise.allSettled(initPromises);
    
    const availableProviders = Array.from(this.providers.entries())
      .filter(([, provider]) => provider.isAvailable())
      .map(([name]) => name);

    console.log(`🎯 Available providers: ${availableProviders.join(', ')}`);
    
    if (availableProviders.length === 0) {
      console.warn('⚠️ No LLM providers are available. The system may not function properly.');
      // Don't throw error, let mock provider handle it
    }

    // Use first available provider if current is not available
    if (!availableProviders.includes(this.currentProvider)) {
      if (availableProviders.length > 0) {
        this.currentProvider = availableProviders[0];
        console.log(`🔄 Switched to ${this.currentProvider} provider`);
      } else {
        console.log('🎭 Using mock provider for demo functionality');
      }
    }
  }

  /**
   * Start or continue a conversation
   */
  async startConversation(userId, options = {}) {
    const { sessionId, provider, model } = options;
    
    // Switch provider if requested
    if (provider && this.providers.has(provider)) {
      this.currentProvider = provider;
    }

    const sessionOptions = {
      llmProvider: this.currentProvider,
      model: model || this.config.defaultModel,
      ...options
    };

    const session = await this.conversationManager.getOrCreateSession(
      userId, 
      sessionId, 
      sessionOptions
    );

    return {
      sessionId: session.sessionId,
      provider: this.currentProvider,
      capabilities: this.getProviderCapabilities(),
      context: session.context
    };
  }

  /**
   * Send a message and get response
   */
  async sendMessage(sessionId, message, options = {}) {
    const startTime = Date.now();
    
    try {
      const session = await this._validateSession(sessionId);
      const provider = await this._setupProvider(options);
      
      await this._addUserMessage(sessionId, message);
      
      const commandResponse = await this._handleSpecialCommands(message, session, options, startTime);
      if (commandResponse) {
        return commandResponse;
      }
      
      const llmResponse = await this._generateLLMResponse(sessionId, session, provider, options);
      const finalResponse = await this._processFunctionCalls(llmResponse, session, provider, options);
      
      return await this._finalizeResponse(sessionId, finalResponse, llmResponse, startTime);
      
    } catch (error) {
      return await this._handleSendMessageError(error, sessionId, startTime);
    }
  }

  /**
   * Validate session exists
   */
  async _validateSession(sessionId) {
    const session = this.conversationManager.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found. Please start a new conversation.');
    }
    return session;
  }

  /**
   * Setup and validate provider
   */
  async _setupProvider(options) {
    if (options.provider && this.providers.has(options.provider)) {
      this.currentProvider = options.provider;
    }

    const provider = this.providers.get(this.currentProvider);
    if (!provider || !provider.isAvailable()) {
      throw new Error(`Provider ${this.currentProvider} is not available`);
    }
    return provider;
  }

  /**
   * Add user message to conversation
   */
  async _addUserMessage(sessionId, message) {
    await this.conversationManager.addMessage(sessionId, {
      role: 'user',
      content: message
    });
  }

  /**
   * Handle special commands and return response if applicable
   */
  async _handleSpecialCommands(message, session, options, startTime) {
    const commandResponse = await this.handleSpecialCommands(message, session, options);
    if (commandResponse) {
      await this.conversationManager.addMessage(session.sessionId, {
        role: 'assistant',
        content: commandResponse.content
      }, {
        responseTime: Date.now() - startTime,
        ...commandResponse.metadata
      });

      return {
        response: commandResponse.content,
        sessionId: session.sessionId,
        provider: this.currentProvider,
        metadata: commandResponse.metadata,
        responseTime: Date.now() - startTime
      };
    }
    return null;
  }

  /**
   * Generate LLM response
   */
  async _generateLLMResponse(sessionId, session, provider, options) {
    const messages = this.conversationManager.getMessagesForLLM(sessionId, {
      maxMessages: options.maxHistory || 10
    });

    const llmResponse = await provider.generateCompletion(messages, {
      model: options.model || session.metadata.model,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 1500,
      functions: this.getMusicFunctions(),
      ...options.llmOptions
    });

    if (llmResponse.error) {
      throw new Error(llmResponse.message);
    }

    return llmResponse;
  }

  /**
   * Process function calls and generate follow-up response
   */
  async _processFunctionCalls(llmResponse, session, provider, options) {
    let finalResponse = llmResponse.content;
    
    if (llmResponse.functionCall || llmResponse.toolCalls) {
      const functionResults = await this.handleFunctionCalls(
        llmResponse.functionCall || llmResponse.toolCalls,
        session,
        options
      );
      
      if (functionResults) {
        finalResponse = await this._generateFollowUpResponse(
          llmResponse, functionResults, session, provider, options
        );
      }
    }
    
    return finalResponse;
  }

  /**
   * Generate follow-up response with function results
   */
  async _generateFollowUpResponse(llmResponse, functionResults, session, provider, options) {
    const followUpMessages = [
      ...this.conversationManager.getMessagesForLLM(session.sessionId, {
        maxMessages: options.maxHistory || 10
      }),
      {
        role: 'assistant',
        content: llmResponse.content,
        function_call: llmResponse.functionCall
      },
      {
        role: 'function',
        content: JSON.stringify(functionResults),
        name: llmResponse.functionCall?.name
      }
    ];

    const followUpResponse = await provider.generateCompletion(followUpMessages, {
      model: options.model || session.metadata.model,
      temperature: 0.7,
      maxTokens: 1000
    });

    return followUpResponse.content || llmResponse.content;
  }

  /**
   * Finalize response and add to conversation
   */
  async _finalizeResponse(sessionId, finalResponse, llmResponse, startTime) {
    const responseMetadata = {
      responseTime: Date.now() - startTime,
      provider: this.currentProvider,
      model: llmResponse.model,
      tokens: llmResponse.usage?.totalTokens || 0,
      functionCalls: llmResponse.functionCall || llmResponse.toolCalls ? 1 : 0
    };

    await this.conversationManager.addMessage(sessionId, {
      role: 'assistant',
      content: finalResponse
    }, responseMetadata);

    return {
      response: finalResponse,
      sessionId,
      provider: this.currentProvider,
      functionResults: llmResponse.functionCall || llmResponse.toolCalls ? true : null,
      metadata: responseMetadata
    };
  }

  /**
   * Handle errors in sendMessage
   */
  async _handleSendMessageError(error, sessionId, startTime) {
    console.error('Error in sendMessage:', error);
    
    const errorResponse = 'I apologize, but I encountered an error while processing your message. Please try again or rephrase your request.';
    
    try {
      await this.conversationManager.addMessage(sessionId, {
        role: 'assistant',
        content: errorResponse
      }, {
        responseTime: Date.now() - startTime,
        error: error.message
      });
    } catch (dbError) {
      console.error('Error saving error message:', dbError);
    }

    return {
      response: errorResponse,
      sessionId,
      error: error.message,
      metadata: {
        responseTime: Date.now() - startTime,
        error: true
      }
    };
  }

  /**
   * Stream a response (for real-time chat)
   */
  async* streamMessage(sessionId, message, options = {}) {
    const startTime = Date.now();
    
    try {
      const session = this.conversationManager.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const provider = this.providers.get(this.currentProvider);
      if (!provider || !provider.isAvailable()) {
        throw new Error(`Provider ${this.currentProvider} is not available`);
      }

      // Add user message
      await this.conversationManager.addMessage(sessionId, {
        role: 'user',
        content: message
      });

      // Get conversation history
      const messages = this.conversationManager.getMessagesForLLM(sessionId);

      let fullResponse = '';
      
      // Stream response
      for await (const chunk of provider.generateStreamingCompletion(messages, options)) {
        if (chunk.error) {
          yield { error: chunk.message, type: 'error' };
          return;
        }

        if (chunk.content) {
          fullResponse += chunk.content;
          yield {
            content: chunk.content,
            type: 'chunk',
            isPartial: chunk.isPartial
          };
        }
      }

      // Save complete response
      await this.conversationManager.addMessage(sessionId, {
        role: 'assistant',
        content: fullResponse
      }, {
        responseTime: Date.now() - startTime,
        provider: this.currentProvider,
        streaming: true
      });

      yield {
        type: 'complete',
        totalTime: Date.now() - startTime
      };

    } catch (error) {
      yield { 
        error: error.message, 
        type: 'error' 
      };
    }
  }

  /**
   * Handle special commands
   */
  async handleSpecialCommands(message, session) {
    const lowerMessage = message.toLowerCase().trim();

    // Playlist creation command
    if (lowerMessage.startsWith('/create playlist')) {
      return await this.handleCreatePlaylistCommand(message, session);
    }

    // Get recommendations command
    if (lowerMessage.startsWith('/recommend')) {
      return await this.handleRecommendCommand(message, session);
    }

    // Analyze listening habits command
    if (lowerMessage.startsWith('/analyze')) {
      return await this.handleAnalyzeCommand(message, session);
    }

    // Help command
    if (lowerMessage === '/help' || lowerMessage === 'help') {
      return {
        content: this.getHelpMessage(),
        metadata: { command: 'help' }
      };
    }

    // Switch provider command
    if (lowerMessage.startsWith('/provider')) {
      const providerName = lowerMessage.split(' ')[1];
      return await this.handleProviderSwitch(providerName);
    }

    return null; // No special command found
  }

  /**
   * Handle function calls from LLM
   */
  async handleFunctionCalls(functionCall, session, options) {
    try {
      const functionName = functionCall.name;
      const args = JSON.parse(functionCall.arguments || '{}');

      switch (functionName) {
        case 'search_tracks':
          return await this.searchTracks(args, session);
        
        case 'create_playlist':
          return await this.createPlaylist(args, session, options);
        
        case 'get_recommendations':
          return await this.getRecommendations(args, session);
        
        case 'analyze_listening_habits':
          return await this.analyzeListeningHabits(args, session);
        
        default:
          return { error: `Unknown function: ${functionName}` };
      }
    } catch (error) {
      console.error('Error handling function call:', error);
      return { error: error.message };
    }
  }

  /**
   * Search for tracks
   */
  async searchTracks(args, session) {
    try {
      const { query, limit = 10, mood, energy, danceability } = args;
      
      // Get access token from session context
      const accessToken = session.context?.spotifyAccessToken;
      
      if (!accessToken) {
        return {
          error: 'Spotify access token not available',
          message: 'Please connect your Spotify account to search for tracks'
        };
      }

      // Search tracks using real Spotify API
      const searchResults = await this.spotifyAPI.searchTracks(query, {
        limit,
        mood,
        energy,
        danceability,
        accessToken
      });

      // Enrich with audio features if needed
      const trackIds = searchResults.tracks.map(track => track.id);
      const audioFeatures = await this.spotifyService.getCachedAudioFeatures(trackIds);
      const audioFeaturesMap = new Map(audioFeatures.map(af => [af.track_id, af]));

      const enrichedTracks = searchResults.tracks.map(track => ({
        ...track,
        audio_features: audioFeaturesMap.get(track.id)
      }));

      return {
        tracks: enrichedTracks,
        total: searchResults.total,
        query: searchResults.query,
        message: `Found ${enrichedTracks.length} tracks matching "${query}"`
      };

    } catch (error) {
      console.error('Error searching tracks:', error);
      return {
        error: error.message,
        message: 'Sorry, I encountered an error while searching for tracks. Please try again.'
      };
    }
  }

  /**
   * Create a playlist
   */
  async createPlaylist(args, session, _options) {
    try {
      const { name, description, tracks = [], public: isPublic = false } = args;
      
      // Get access token and user ID from session context
      const accessToken = session.context?.spotifyAccessToken;
      // userId removed - was unused
      if (!accessToken) {
        return {
          error: 'Spotify access token not available',
          message: 'Please connect your Spotify account to create playlists'
        };
      }

      // Create playlist using real Spotify API
      const playlist = await this.spotifyAPI.createPlaylist(session.userId || 'default_user', {
        name: name || 'EchoTune AI Playlist',
        description: description || 'Created by EchoTune AI',
        public: isPublic
      }, { accessToken });

      // Add tracks if provided
      let addedTracks = 0;
      if (tracks && tracks.length > 0) {
        // Convert track IDs to URIs
        const trackUris = tracks.map(track => 
          typeof track === 'string' ? `spotify:track:${track}` : `spotify:track:${track.id}`
        );
        
        const addResult = await this.spotifyAPI.addTracksToPlaylist(
          playlist.id, 
          trackUris, 
          { accessToken }
        );
        addedTracks = addResult.added_tracks;
      }

      // Store playlist creation in user activity
      await this.logUserActivity(session.userId, {
        action: 'playlist_created',
        playlist_id: playlist.id,
        playlist_name: playlist.name,
        tracks_added: addedTracks
      });

      return {
        playlist: {
          ...playlist,
          tracks_added: addedTracks
        },
        success: true,
        message: `Successfully created playlist "${playlist.name}"${addedTracks > 0 ? ` with ${addedTracks} tracks` : ''}`
      };

    } catch (error) {
      console.error('Error creating playlist:', error);
      return {
        error: error.message,
        message: 'Sorry, I encountered an error while creating the playlist. Please try again.'
      };
    }
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(args, session) {
    try {
      const recommendations = await this.recommendationEngine.generateRecommendations(
        session.userId,
        {
          limit: args.limit || 10,
          mood: args.target_features?.mood,
          activity: args.target_features?.activity
        }
      );

      return {
        recommendations: recommendations.recommendations,
        total: recommendations.recommendations.length,
        algorithm: 'hybrid'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Analyze listening habits
   */
  async analyzeListeningHabits(args, session) {
    try {
      const { time_period = 'medium_term', include_audio_features = true } = args;
      
      // Get access token from session context
      const accessToken = session.context?.spotifyAccessToken;
      
      if (!accessToken) {
        return {
          error: 'Spotify access token not available',
          message: 'Please connect your Spotify account to analyze your listening habits'
        };
      }

      // Get user's top tracks and artists from Spotify
      const [topTracks, topArtists] = await Promise.all([
        this.spotifyAPI.getUserTopTracks({
          time_range: time_period,
          limit: 50,
          accessToken
        }),
        this.spotifyAPI.getUserTopArtists({
          time_range: time_period,
          limit: 20,
          accessToken
        })
      ]);

      // Get listening history from database
      const listeningHistory = await this.recommendationEngine.getUserListeningHistory(
        session.userId, 
        { limit: 1000 }
      );

      // Analyze audio features if requested
      let audioAnalysis = null;
      if (include_audio_features && topTracks.tracks.length > 0) {
        const trackIds = topTracks.tracks.map(track => track.id);
        const audioFeatures = await this.spotifyService.getCachedAudioFeatures(trackIds);
        
        if (audioFeatures.length > 0) {
          audioAnalysis = this.calculateAudioFeatureStats(audioFeatures);
        }
      }

      // Extract genres from top artists
      const allGenres = topArtists.artists.flatMap(artist => artist.genres);
      const genreCounts = {};
      allGenres.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
      
      const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count }));

      // Calculate listening patterns
      const listeningPatterns = this.analyzeListeningPatterns(listeningHistory);

      const analysis = {
        time_period,
        top_tracks: topTracks.tracks.slice(0, 10),
        top_artists: topArtists.artists.slice(0, 10),
        top_genres: topGenres,
        listening_patterns: listeningPatterns,
        audio_features_profile: audioAnalysis,
        total_tracks_analyzed: topTracks.tracks.length,
        database_history_count: listeningHistory.length
      };

      // Generate insights
      const insights = this.generateListeningInsights(analysis);

      return {
        analysis,
        insights,
        message: `Analysis complete! Found ${topTracks.tracks.length} top tracks and ${topArtists.artists.length} top artists.`
      };

    } catch (error) {
      console.error('Error analyzing listening habits:', error);
      return {
        error: error.message,
        message: 'Sorry, I encountered an error while analyzing your listening habits. Please try again.'
      };
    }
  }

  /**
   * Get available providers and their capabilities
   */
  getAvailableProviders() {
    return Array.from(this.providers.entries())
      .filter(([, provider]) => provider.isAvailable())
      .map(([name, provider]) => ({
        name,
        capabilities: provider.getCapabilities(),
        isActive: name === this.currentProvider
      }));
  }

  /**
   * Switch LLM provider
   */
  async switchProvider(providerName) {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const provider = this.providers.get(providerName);
    if (!provider.isAvailable()) {
      throw new Error(`Provider ${providerName} is not available`);
    }

    this.currentProvider = providerName;
    console.log(`🔄 Switched to ${providerName} provider`);
    
    return {
      provider: providerName,
      capabilities: provider.getCapabilities()
    };
  }

  /**
   * Get current provider capabilities
   */
  getProviderCapabilities() {
    const provider = this.providers.get(this.currentProvider);
    return provider ? provider.getCapabilities() : null;
  }

  /**
   * Get music-related functions for LLM
   */
  getMusicFunctions() {
    const provider = this.providers.get(this.currentProvider);
    if (provider && provider.getMusicFunctions) {
      return provider.getMusicFunctions();
    }
    return [];
  }

  /**
   * Get help message
   */
  getHelpMessage() {
    return `🎵 EchoTune AI Help

I'm your personal music assistant! Here's what I can help you with:

**Music Discovery:**
- "Recommend some upbeat songs for working out"
- "Find me some calm acoustic music"
- "What's similar to [song name]?"

**Playlist Creation:**
- "Create a playlist for studying"
- "Make a road trip playlist"
- "/create playlist [name] with [mood/genre]"

**Music Analysis:**
- "Analyze my listening habits"
- "What are my top genres?"
- "/analyze [week/month/year]"

**Commands:**
- /help - Show this help message
- /recommend [criteria] - Get recommendations
- /analyze [period] - Analyze listening data
- /provider [name] - Switch AI provider

**Available Providers:**
${this.getAvailableProviders().map(p => `- ${p.name} ${p.isActive ? '(active)' : ''}`).join('\n')}

Just ask me anything about music and I'll help you discover your next favorite song! 🎶`;
  }

  /**
   * Get conversation statistics
   */
  getStats() {
    const activeSessionsCount = this.conversationManager.activeSessions.size;
    const providersStatus = this.getAvailableProviders();
    
    return {
      activeSessions: activeSessionsCount,
      currentProvider: this.currentProvider,
      availableProviders: providersStatus.length,
      providers: providersStatus
    };
  }

  /**
   * Log user activity for analytics
   */
  async logUserActivity(userId, activity) {
    try {
      const db = require('../database/mongodb').getDb();
      const userActivityCollection = db.collection('user_activity');
      
      await userActivityCollection.insertOne({
        user_id: userId,
        ...activity,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error logging user activity:', error);
      // Don't throw - activity logging shouldn't break the main flow
    }
  }

  /**
   * Calculate audio feature statistics
   */
  calculateAudioFeatureStats(audioFeatures) {
    if (audioFeatures.length === 0) return null;

    const features = ['energy', 'danceability', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'liveness'];
    const stats = {};

    features.forEach(feature => {
      const values = audioFeatures.map(af => af[feature]).filter(v => v !== undefined);
      if (values.length > 0) {
        stats[feature] = {
          average: values.reduce((sum, val) => sum + val, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    });

    // Calculate tempo stats separately
    const tempoValues = audioFeatures.map(af => af.tempo).filter(v => v !== undefined);
    if (tempoValues.length > 0) {
      stats.tempo = {
        average: tempoValues.reduce((sum, val) => sum + val, 0) / tempoValues.length,
        min: Math.min(...tempoValues),
        max: Math.max(...tempoValues)
      };
    }

    return stats;
  }

  /**
   * Analyze listening patterns from history
   */
  analyzeListeningPatterns(listeningHistory) {
    if (listeningHistory.length === 0) {
      return {
        most_active_hours: [],
        most_active_days: [],
        listening_streaks: [],
        total_listening_time: 0
      };
    }

    // Analyze by hour of day
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    let totalDuration = 0;

    listeningHistory.forEach(item => {
      const playedAt = new Date(item.played_at);
      hourCounts[playedAt.getHours()]++;
      dayCounts[playedAt.getDay()]++;
      
      if (item.duration_ms) {
        totalDuration += item.duration_ms;
      }
    });

    // Find most active hours
    const mostActiveHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Find most active days
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostActiveDays = dayCounts
      .map((count, day) => ({ day: dayNames[day], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      most_active_hours: mostActiveHours,
      most_active_days: mostActiveDays,
      total_listening_time: Math.round(totalDuration / 1000 / 60), // minutes
      total_tracks: listeningHistory.length
    };
  }

  /**
   * Generate insights from listening analysis
   */
  generateListeningInsights(analysis) {
    const insights = [];

    // Genre diversity insight
    if (analysis.top_genres.length > 5) {
      insights.push('You have very diverse musical taste across multiple genres!');
    } else if (analysis.top_genres.length > 0) {
      insights.push(`Your music taste is focused primarily on ${analysis.top_genres[0].genre} music.`);
    }

    // Audio features insights
    if (analysis.audio_features_profile) {
      const features = analysis.audio_features_profile;
      
      if (features.energy?.average > 0.7) {
        insights.push('You prefer high-energy, upbeat music that gets you moving!');
      } else if (features.energy?.average < 0.3) {
        insights.push('You enjoy calm, low-energy music that\'s perfect for relaxation.');
      }

      if (features.danceability?.average > 0.7) {
        insights.push('Your tracks have high danceability - you love music you can dance to!');
      }

      if (features.valence?.average > 0.7) {
        insights.push('Your music tends to be very positive and uplifting!');
      } else if (features.valence?.average < 0.3) {
        insights.push('You\'re drawn to more melancholic or introspective music.');
      }

      if (features.acousticness?.average > 0.7) {
        insights.push('You have a strong preference for acoustic and organic sounds.');
      }
    }

    // Listening patterns insights
    if (analysis.listening_patterns.most_active_hours.length > 0) {
      const topHour = analysis.listening_patterns.most_active_hours[0];
      if (topHour.hour >= 6 && topHour.hour < 12) {
        insights.push('You\'re most active listening to music in the morning!');
      } else if (topHour.hour >= 12 && topHour.hour < 18) {
        insights.push('Afternoon is your prime music listening time!');
      } else if (topHour.hour >= 18 && topHour.hour < 22) {
        insights.push('You\'re an evening music lover!');
      } else {
        insights.push('You\'re a night owl when it comes to music!');
      }
    }

    return insights;
  }

  /**
   * Legacy chat method for compatibility
   * @param {string} message - User message  
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Chat response
   */
  async chat(message, sessionId) {
    const response = await this.sendMessage(sessionId, message);
    return {
      text: response.content || response.text || 'I\'m having trouble processing that request.',
      provider: this.currentProvider,
      sessionId: sessionId
    };
  }
}

module.exports = EchoTuneChatbot;