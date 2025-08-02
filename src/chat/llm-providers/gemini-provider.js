const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseLLMProvider = require('./base-provider');

/**
 * Google Gemini LLM Provider
 * Supports Gemini Pro and other Google AI models
 */
class GeminiProvider extends BaseLLMProvider {
  constructor(config) {
    super(config);
    this.client = null;
    this.defaultModel = config.model || 'gemini-1.5-flash';
    this.supportedModels = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-pro-vision'
    ];
  }

  async initialize() {
    try {
      if (!this.config.apiKey) {
        throw new Error('Google AI API key not provided');
      }

      this.client = new GoogleGenerativeAI(this.config.apiKey);
      this.isInitialized = true;
      console.log(`✅ Gemini provider initialized with model: ${this.defaultModel}`);
    } catch (error) {
      console.error('❌ Failed to initialize Gemini provider:', error.message);
      throw error;
    }
  }

  validateConfig() {
    return !!(this.config.apiKey);
  }

  getCapabilities() {
    return {
      streaming: true,
      functionCalling: false, // Limited function calling support
      maxTokens: this.getMaxTokensForModel(this.defaultModel),
      supportedModels: this.supportedModels,
      features: ['chat', 'completion', 'streaming', 'vision']
    };
  }

  getMaxTokensForModel(model) {
    const tokenLimits = {
      'gemini-pro': 32768,
      'gemini-pro-vision': 16384,
      'gemini-1.5-pro': 1048576,
      'gemini-1.5-flash': 1048576
    };
    return tokenLimits[model] || 32768;
  }

  async generateCompletion(messages, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Gemini provider not initialized or configured');
      }

      // Always use Gemini's default model, don't inherit from other providers
      const modelName = (options.model && options.model.includes('gemini')) ? options.model : this.defaultModel;
      
      const model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          topP: options.topP ?? 0.8,
          topK: options.topK ?? 10
        }
      });

      // Convert messages to Gemini format
      const geminiMessages = this.formatMessagesForGemini(messages);
      
      let response;
      if (geminiMessages.length === 1) {
        // Single message - use generateContent
        response = await model.generateContent(geminiMessages[0].parts);
      } else {
        // Multiple messages - use chat
        const chat = model.startChat({
          history: geminiMessages.slice(0, -1)
        });
        const lastMessage = geminiMessages[geminiMessages.length - 1];
        response = await chat.sendMessage(lastMessage.parts);
      }

      const content = response.response.text();
      
      return this.parseResponse({
        content,
        role: 'assistant',
        model: modelName,
        usage: {
          promptTokens: response.response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.response.usageMetadata?.totalTokenCount || 0
        },
        finishReason: response.response.candidates?.[0]?.finishReason
      });

    } catch (error) {
      return this.handleError(error);
    }
  }

  async* generateStreamingCompletion(messages, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Gemini provider not initialized or configured');
      }

      const model = this.client.getGenerativeModel({ 
        model: options.model || this.defaultModel,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          topP: options.topP ?? 0.8,
          topK: options.topK ?? 10
        }
      });

      const geminiMessages = this.formatMessagesForGemini(messages);
      
      let stream;
      if (geminiMessages.length === 1) {
        stream = await model.generateContentStream(geminiMessages[0].parts);
      } else {
        const chat = model.startChat({
          history: geminiMessages.slice(0, -1)
        });
        const lastMessage = geminiMessages[geminiMessages.length - 1];
        stream = await chat.sendMessageStream(lastMessage.parts);
      }

      for await (const chunk of stream.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          yield {
            content: chunkText,
            role: 'assistant',
            model: options.model || this.defaultModel,
            isPartial: true
          };
        }
      }

    } catch (error) {
      yield this.handleError(error);
    }
  }

  formatMessagesForGemini(messages) {
    const geminiMessages = [];
    
    for (const message of messages) {
      if (message.role === 'system') {
        // Gemini doesn't have system role, prepend to first user message
        continue;
      }

      const geminiRole = message.role === 'assistant' ? 'model' : 'user';
      
      geminiMessages.push({
        role: geminiRole,
        parts: [{ text: message.content }]
      });
    }

    // Prepend system message to first user message if exists
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage && geminiMessages.length > 0 && geminiMessages[0].role === 'user') {
      geminiMessages[0].parts[0].text = `${systemMessage.content}\n\nUser: ${geminiMessages[0].parts[0].text}`;
    }

    return geminiMessages;
  }

  /**
   * Create music-specific system prompt for Gemini
   */
  createMusicSystemPrompt() {
    return {
      role: 'system',
      content: `You are EchoTune AI, an intelligent music assistant that helps users discover new music, create playlists, and explore their musical tastes. You have access to Spotify's extensive music catalog and can analyze audio features to make personalized recommendations.

Your capabilities include:
- Analyzing user listening history and preferences
- Recommending songs based on mood, activity, or specific criteria
- Creating personalized playlists
- Explaining music characteristics and audio features
- Helping users discover new artists and genres
- Providing insights about their listening habits

Key audio features you can work with:
- Energy (0-1): How energetic and intense the track feels
- Valence (0-1): The musical positivity (happy vs sad)
- Danceability (0-1): How suitable the track is for dancing
- Acousticness (0-1): How acoustic vs electronic the track is
- Tempo (BPM): The speed of the track

Be conversational, enthusiastic about music, and ask clarifying questions to provide better recommendations. Consider the user's mood and context when making suggestions. Respond naturally and avoid being overly technical unless requested.`
    };
  }

  /**
   * Handle music-related queries with structured responses
   */
  async handleMusicQuery(query, context = {}) {
    const systemPrompt = this.createMusicSystemPrompt();
    
    let conversationContext = '';
    if (context.userProfile) {
      conversationContext += `User's favorite genres: ${context.userProfile.favorite_genres?.join(', ') || 'Not specified'}\n`;
    }
    
    if (context.recentTracks) {
      conversationContext += `Recent tracks: ${context.recentTracks.slice(0, 5).map(t => `${t.track_name} by ${t.artist_name}`).join(', ')}\n`;
    }

    const messages = [
      systemPrompt,
      {
        role: 'user',
        content: `${conversationContext}\n\nUser query: ${query}`
      }
    ];

    return await this.generateCompletion(messages, {
      temperature: 0.7,
      maxTokens: 1000
    });
  }

  /**
   * Generate playlist description based on tracks
   */
  async generatePlaylistDescription(tracks, theme = '') {
    const trackList = tracks.slice(0, 10).map(t => 
      `${t.track_name} by ${t.artist_name}`
    ).join(', ');

    const prompt = `Create a creative and engaging description for a music playlist. 
    
Theme: ${theme || 'Mixed music selection'}
Tracks included: ${trackList}

Write a short, catchy description (2-3 sentences) that captures the mood and vibe of this playlist. Make it sound appealing to potential listeners.`;

    const response = await this.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.8,
      maxTokens: 200
    });

    return response.content || `A carefully curated playlist featuring ${tracks.length} tracks`;
  }

  /**
   * Generate music insights and analysis
   */
  async generateListeningInsights(analytics) {
    const prompt = `Analyze the following music listening data and provide interesting insights:

Top Genres: ${analytics.topGenres?.map(g => `${g.genre} (${g.count} plays)`).join(', ') || 'Not available'}
Top Artists: ${analytics.topArtists?.map(a => `${a.artist} (${a.plays} plays)`).join(', ') || 'Not available'}
Average Audio Features: ${JSON.stringify(analytics.averageFeatures || {})}
Listening Patterns: ${analytics.patterns || 'Not available'}

Provide insights about:
1. Musical taste and preferences
2. Listening behavior patterns
3. Recommendations for music discovery
4. Interesting observations about their music choices

Keep it conversational and engaging, highlighting the most interesting aspects.`;

    const response = await this.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.7,
      maxTokens: 500
    });

    return response.content;
  }

  estimateTokens(text) {
    // Gemini token estimation (similar to other models)
    return Math.ceil(text.length / 4);
  }
}

module.exports = GeminiProvider;