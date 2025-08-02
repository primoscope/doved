const OpenAI = require('openai');
const BaseLLMProvider = require('./base-provider');

/**
 * OpenAI LLM Provider
 * Supports GPT-3.5, GPT-4, and other OpenAI models with enhanced error handling
 */
class OpenAIProvider extends BaseLLMProvider {
  constructor(config) {
    super(config);
    this.client = null;
    this.defaultModel = config.model || 'gpt-4o-mini';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.requestCount = 0;
    this.errorCount = 0;
    
    this.supportedModels = [
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'gpt-4',
      'gpt-4-turbo-preview',
      'gpt-4o',
      'gpt-4o-mini'
    ];
  }

  async initialize() {
    try {
      if (!this.config.apiKey) {
        throw new Error('OpenAI API key not provided. Please set OPENAI_API_KEY environment variable.');
      }

      // Validate API key format
      if (!this.config.apiKey.startsWith('sk-')) {
        throw new Error('Invalid OpenAI API key format. API key should start with "sk-"');
      }

      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        organization: this.config.organization,
        timeout: this.config.timeout || 30000,
        maxRetries: this.maxRetries
      });

      // Test the connection with a simple API call
      await this.testConnection();

      this.isInitialized = true;
      console.log(`✅ OpenAI provider initialized successfully with model: ${this.defaultModel}`);
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI provider:', error.message);
      this.isInitialized = false;
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.client.models.list();
      console.log('✅ OpenAI API connection test successful');
    } catch (error) {
      console.error('❌ OpenAI API connection test failed:', error.message);
      throw new Error(`OpenAI API connection failed: ${error.message}`);
    }
  }

  validateConfig() {
    return !!(this.config.apiKey && this.config.apiKey.startsWith('sk-'));
  }

  isAvailable() {
    return this.isInitialized && this.validateConfig() && this.errorCount < 5;
  }

  getCapabilities() {
    return {
      streaming: true,
      functionCalling: true,
      maxTokens: this.getMaxTokensForModel(this.defaultModel),
      supportedModels: this.supportedModels,
      features: ['chat', 'completion', 'function_calling', 'streaming']
    };
  }

  getMaxTokensForModel(model) {
    const tokenLimits = {
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
      'gpt-4': 8192,
      'gpt-4-turbo-preview': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000
    };
    return tokenLimits[model] || 4096;
  }

  async generateCompletion(messages, options = {}) {
    this.requestCount++;
    
    try {
      if (!this.isAvailable()) {
        throw new Error('OpenAI provider not initialized or configured');
      }

      const model = options.model || this.defaultModel;
      const maxTokens = options.maxTokens || 2000;
      const temperature = options.temperature ?? 0.7;

      const requestData = {
        model,
        messages: this.formatMessages(messages),
        max_tokens: Math.min(maxTokens, this.getMaxTokensForModel(model) - 1000), // Reserve tokens for response
        temperature,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0
      };

      // Add function/tool calling support
      if (options.functions) {
        requestData.functions = options.functions;
        requestData.function_call = options.functionCall || 'auto';
      }

      if (options.tools) {
        requestData.tools = options.tools;
        requestData.tool_choice = options.toolChoice || 'auto';
      }

      const response = await this.retryRequest(async () => {
        return await this.client.chat.completions.create(requestData);
      });

      // Reset error count on successful request
      this.errorCount = 0;

      return this.parseResponse({
        content: response.choices[0].message.content,
        role: response.choices[0].message.role,
        model: response.model,
        usage: response.usage,
        functionCall: response.choices[0].message.function_call,
        toolCalls: response.choices[0].message.tool_calls,
        finishReason: response.choices[0].finish_reason
      });

    } catch (error) {
      this.errorCount++;
      return this.handleError(error);
    }
  }

  async* generateStreamingCompletion(messages, options = {}) {
    this.requestCount++;
    
    try {
      if (!this.isAvailable()) {
        throw new Error('OpenAI provider not initialized or configured');
      }

      const model = options.model || this.defaultModel;
      const maxTokens = options.maxTokens || 2000;
      const temperature = options.temperature ?? 0.7;

      const stream = await this.retryRequest(async () => {
        return await this.client.chat.completions.create({
          model,
          messages: this.formatMessages(messages),
          max_tokens: Math.min(maxTokens, this.getMaxTokensForModel(model) - 1000),
          temperature,
          stream: true,
          top_p: options.topP ?? 1,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0
        });
      });

      // Reset error count on successful request
      this.errorCount = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield {
            content: delta.content,
            role: 'assistant',
            model: chunk.model,
            finishReason: chunk.choices[0]?.finish_reason,
            isPartial: true
          };
        }
      }

    } catch (error) {
      this.errorCount++;
      throw this.handleError(error);
    }
  }

  async retryRequest(requestFn, retryCount = 0) {
    try {
      return await requestFn();
    } catch (error) {
      // Check if we should retry
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        console.log(`🔄 Retrying OpenAI request (attempt ${retryCount + 1}/${this.maxRetries})...`);
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.retryRequest(requestFn, retryCount + 1);
      }
      
      throw error;
    }
  }

  shouldRetry(error) {
    // Retry on rate limits, network errors, and temporary server errors
    if (error.status) {
      return [429, 500, 502, 503, 504].includes(error.status);
    }
    
    // Retry on network errors
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' || 
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  handleError(error) {
    console.error('OpenAI API Error:', error);
    
    // Enhanced error messages
    if (error.status === 401) {
      return {
        error: 'Authentication failed. Please check your OpenAI API key.',
        type: 'auth_error',
        retryable: false
      };
    }
    
    if (error.status === 429) {
      return {
        error: 'Rate limit exceeded. Please try again in a moment.',
        type: 'rate_limit',
        retryable: true
      };
    }
    
    if (error.status === 402) {
      return {
        error: 'Insufficient quota. Please check your OpenAI billing.',
        type: 'quota_exceeded',
        retryable: false
      };
    }

    if (error.status >= 500) {
      return {
        error: 'OpenAI service temporarily unavailable. Please try again.',
        type: 'server_error',
        retryable: true
      };
    }

    return {
      error: `OpenAI API error: ${error.message}`,
      type: 'unknown_error',
      retryable: false
    };
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) : 0,
      isHealthy: this.errorCount < 5 && this.isAvailable()
    };
  }

  formatMessages(messages) {
    return messages.map(msg => {
      const formatted = {
        role: msg.role,
        content: msg.content
      };

      if (msg.name) {
        formatted.name = msg.name;
      }

      if (msg.function_call) {
        formatted.function_call = msg.function_call;
      }

      if (msg.tool_calls) {
        formatted.tool_calls = msg.tool_calls;
      }

      return formatted;
    });
  }

  parseResponse(response) {
    const parsed = super.parseResponse(response);
    
    if (response.functionCall) {
      parsed.functionCall = response.functionCall;
    }

    if (response.toolCalls) {
      parsed.toolCalls = response.toolCalls;
    }

    parsed.finishReason = response.finishReason;
    
    return parsed;
  }

  /**
   * Create music-specific system prompt
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

Be conversational, helpful, and enthusiastic about music. Ask clarifying questions when needed to provide better recommendations. Always consider the user's current mood and context when making suggestions.

When recommending music, consider these audio features:
- Energy: How energetic and intense the track feels
- Valence: The musical positivity (happy vs sad)
- Danceability: How suitable the track is for dancing
- Acousticness: How acoustic vs electronic the track is
- Instrumentalness: How much the track is instrumental
- Speechiness: How much spoken word is present
- Tempo: The speed of the track (BPM)

Respond naturally and avoid being overly technical unless the user asks for specific details.`
    };
  }

  /**
   * Create music recommendation functions for function calling
   */
  getMusicFunctions() {
    return [
      {
        name: 'search_tracks',
        description: 'Search for tracks based on query, genre, or audio features',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for tracks, artists, or albums'
            },
            genres: {
              type: 'array',
              items: { type: 'string' },
              description: 'Preferred genres'
            },
            mood: {
              type: 'string',
              enum: ['happy', 'sad', 'energetic', 'calm', 'upbeat', 'melancholy'],
              description: 'Mood for the music'
            },
            activity: {
              type: 'string',
              enum: ['workout', 'study', 'party', 'relaxation', 'commute'],
              description: 'Activity context'
            },
            audio_features: {
              type: 'object',
              properties: {
                energy: { type: 'number', minimum: 0, maximum: 1 },
                valence: { type: 'number', minimum: 0, maximum: 1 },
                danceability: { type: 'number', minimum: 0, maximum: 1 },
                acousticness: { type: 'number', minimum: 0, maximum: 1 }
              }
            },
            limit: {
              type: 'number',
              default: 10,
              description: 'Number of tracks to return'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'create_playlist',
        description: 'Create a new playlist based on specified criteria',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name for the playlist'
            },
            description: {
              type: 'string',
              description: 'Description for the playlist'
            },
            tracks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of track IDs to include'
            },
            mood: {
              type: 'string',
              description: 'Mood theme for the playlist'
            },
            activity: {
              type: 'string',
              description: 'Activity theme for the playlist'
            },
            public: {
              type: 'boolean',
              default: false,
              description: 'Whether the playlist should be public'
            }
          },
          required: ['name', 'tracks']
        }
      },
      {
        name: 'get_recommendations',
        description: 'Get personalized music recommendations for the user',
        parameters: {
          type: 'object',
          properties: {
            seed_tracks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Track IDs to base recommendations on'
            },
            seed_artists: {
              type: 'array',
              items: { type: 'string' },
              description: 'Artist IDs to base recommendations on'
            },
            seed_genres: {
              type: 'array',
              items: { type: 'string' },
              description: 'Genres to base recommendations on'
            },
            target_features: {
              type: 'object',
              description: 'Target audio features for recommendations'
            },
            limit: {
              type: 'number',
              default: 20,
              description: 'Number of recommendations to return'
            }
          }
        }
      },
      {
        name: 'analyze_listening_habits',
        description: 'Analyze user\'s listening history and provide insights',
        parameters: {
          type: 'object',
          properties: {
            time_period: {
              type: 'string',
              enum: ['week', 'month', 'year', 'all_time'],
              default: 'month',
              description: 'Time period to analyze'
            },
            analysis_type: {
              type: 'string',
              enum: ['genres', 'artists', 'audio_features', 'listening_patterns'],
              default: 'genres',
              description: 'Type of analysis to perform'
            }
          }
        }
      }
    ];
  }

  estimateTokens(text) {
    // More accurate estimation for OpenAI models
    return Math.ceil(text.length / 3.5);
  }
}

module.exports = OpenAIProvider;