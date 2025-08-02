const axios = require('axios');
const BaseLLMProvider = require('./base-provider');

/**
 * Custom API Provider for External LLM Services
 * Supports custom endpoints, Azure OpenAI, OpenRouter, etc.
 */
class CustomAPIProvider extends BaseLLMProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.baseURL || config.endpoint;
    this.defaultModel = config.model || 'gpt-3.5-turbo';
    this.headers = this.buildHeaders(config);
    this.supportedModels = config.supportedModels || [this.defaultModel];
  }

  buildHeaders(config) {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Handle different authentication methods
    if (config.apiKey) {
      if (config.provider === 'azure') {
        headers['api-key'] = config.apiKey;
      } else if (config.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['HTTP-Referer'] = config.referer || 'https://echotune.ai';
        headers['X-Title'] = 'EchoTune AI';
      } else {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
    }

    if (config.customHeaders) {
      Object.assign(headers, config.customHeaders);
    }

    return headers;
  }

  async initialize() {
    try {
      if (!this.baseURL) {
        throw new Error('Base URL not provided for custom API provider');
      }

      // Test connection with a simple request
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`✅ Custom API provider initialized: ${this.config.provider || 'Custom'}`);
    } catch (error) {
      console.error('❌ Failed to initialize custom API provider:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      // Simple test with minimal request
      const testMessages = [{ role: 'user', content: 'Hello' }];
      await this.generateCompletion(testMessages, { maxTokens: 5 });
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Authentication failed - check API key');
      } else if (error.response?.status === 404) {
        throw new Error('Endpoint not found - check base URL');
      }
      throw error;
    }
  }

  validateConfig() {
    return !!(this.baseURL && (this.config.apiKey || this.config.customHeaders));
  }

  getCapabilities() {
    return {
      streaming: this.config.supportsStreaming ?? false,
      functionCalling: this.config.supportsFunctionCalling ?? false,
      maxTokens: this.config.maxTokens || 4096,
      supportedModels: this.supportedModels,
      features: this.config.features || ['chat', 'completion']
    };
  }

  async generateCompletion(messages, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Custom API provider not initialized or configured');
      }

      const model = options.model || this.defaultModel;
      const requestData = this.buildRequestData(messages, options, model);
      
      const response = await axios.post(
        this.getCompletionsEndpoint(),
        requestData,
        { 
          headers: this.headers,
          timeout: options.timeout || 30000
        }
      );

      return this.parseAPIResponse(response.data, model);

    } catch (error) {
      return this.handleError(error);
    }
  }

  async* generateStreamingCompletion(messages, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Custom API provider not initialized or configured');
      }

      if (!this.getCapabilities().streaming) {
        // Fallback to non-streaming
        const response = await this.generateCompletion(messages, options);
        yield response;
        return;
      }

      const model = options.model || this.defaultModel;
      const requestData = this.buildRequestData(messages, options, model);
      requestData.stream = true;

      const response = await axios.post(
        this.getCompletionsEndpoint(),
        requestData,
        {
          headers: this.headers,
          responseType: 'stream',
          timeout: options.timeout || 60000
        }
      );

      let buffer = '';
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = this.extractStreamContent(parsed);
              if (content) {
                yield {
                  content,
                  role: 'assistant',
                  model,
                  isPartial: true
                };
              }
            } catch (parseError) {
              // Skip invalid JSON chunks
              continue;
            }
          }
        }
      }

    } catch (error) {
      yield this.handleError(error);
    }
  }

  buildRequestData(messages, options, model) {
    const requestData = {
      model,
      messages: this.formatMessages(messages),
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature ?? 0.7
    };

    // Add provider-specific parameters
    if (this.config.provider === 'azure') {
      // Azure OpenAI specific parameters
      requestData.top_p = options.topP ?? 1;
      requestData.frequency_penalty = options.frequencyPenalty ?? 0;
      requestData.presence_penalty = options.presencePenalty ?? 0;
    } else if (this.config.provider === 'openrouter') {
      // OpenRouter specific parameters
      requestData.top_p = options.topP ?? 1;
      requestData.top_k = options.topK;
      requestData.repetition_penalty = options.repetitionPenalty;
      requestData.min_p = options.minP;
    }

    // Add custom parameters if specified
    if (this.config.customParameters) {
      Object.assign(requestData, this.config.customParameters);
    }

    return requestData;
  }

  getCompletionsEndpoint() {
    if (this.config.provider === 'azure') {
      return `${this.baseURL}/openai/deployments/${this.defaultModel}/chat/completions?api-version=2023-12-01-preview`;
    }
    
    // For OpenRouter and other providers, the base URL already includes /v1 if needed
    return `${this.baseURL}/chat/completions`;
  }

  parseAPIResponse(responseData, model) {
    // Handle different response formats
    let content = '';
    let usage = {};
    let finishReason = '';

    if (responseData.choices && responseData.choices.length > 0) {
      const choice = responseData.choices[0];
      content = choice.message?.content || choice.text || '';
      finishReason = choice.finish_reason;
    }

    if (responseData.usage) {
      usage = responseData.usage;
    }

    return this.parseResponse({
      content,
      role: 'assistant',
      model: responseData.model || model,
      usage,
      finishReason
    });
  }

  extractStreamContent(chunk) {
    if (chunk.choices && chunk.choices.length > 0) {
      const choice = chunk.choices[0];
      return choice.delta?.content || choice.text || '';
    }
    return '';
  }

  /**
   * Create provider-specific configurations
   */
  static createAzureConfig(config) {
    return {
      provider: 'azure',
      baseURL: config.endpoint,
      apiKey: config.apiKey,
      model: config.deployment || 'gpt-35-turbo',
      supportsStreaming: true,
      supportsFunctionCalling: true,
      maxTokens: 16384
    };
  }

  static createOpenRouterConfig(config) {
    return {
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      model: config.model || 'deepseek/deepseek-r1-0528:free',
      customHeaders: {
        'HTTP-Referer': config.referer || 'https://echotune.ai',
        'X-Title': 'EchoTune AI'
      },
      supportsStreaming: true,
      supportsFunctionCalling: true,
      maxTokens: 32768,
      supportedModels: [
        'deepseek/deepseek-r1-0528:free',
        'deepseek/deepseek-chat-v3-0324:free',
        'openai/gpt-3.5-turbo',
        'openai/gpt-4',
        'anthropic/claude-2',
        'google/palm-2-chat-bison',
        'meta-llama/llama-2-70b-chat'
      ]
    };
  }

  static createCustomConfig(config) {
    return {
      provider: 'custom',
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model || 'default',
      customHeaders: config.headers || {},
      customParameters: config.parameters || {},
      supportsStreaming: config.streaming ?? false,
      supportsFunctionCalling: config.functionCalling ?? false,
      maxTokens: config.maxTokens || 4096,
      supportedModels: config.models || ['default']
    };
  }

  /**
   * Handle music-specific requests for custom providers
   */
  async handleMusicQuery(query) {
    const systemPrompt = {
      role: 'system',
      content: 'You are EchoTune AI, a music recommendation assistant. Help users discover music, create playlists, and understand their listening habits. Be conversational and enthusiastic about music.'
    };

    const messages = [
      systemPrompt,
      {
        role: 'user',
        content: query
      }
    ];

    return await this.generateCompletion(messages, {
      temperature: 0.7,
      maxTokens: 1000
    });
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      let message = 'API request failed';
      if (status === 401) {
        message = 'Authentication failed - check API key';
      } else if (status === 403) {
        message = 'Access forbidden - check permissions';
      } else if (status === 404) {
        message = 'Endpoint not found - check base URL';
      } else if (status === 429) {
        message = 'Rate limit exceeded - try again later';
      } else if (data?.error?.message) {
        message = data.error.message;
      }

      return {
        error: true,
        message,
        status,
        provider: this.name,
        details: data
      };
    }

    return super.handleError(error);
  }
}

module.exports = CustomAPIProvider;