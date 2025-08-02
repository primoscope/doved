const fs = require('fs').promises;
const path = require('path');

/**
 * Enhanced LLM Provider Manager
 * Implements automatic API key refresh and provider failover
 */
class LLMProviderManager {
  constructor() {
    this.providers = new Map();
    this.providerConfigs = new Map();
    this.keyRefreshHandlers = new Map();
    this.fallbackOrder = ['gemini', 'openai', 'openrouter', 'mock']; // Prioritize Gemini first
    this.currentProvider = 'gemini'; // Default to Gemini
    this.initialized = false;
  }

  /**
   * Initialize provider manager with automatic key refresh
   */
  async initialize() {
    try {
      // Load provider configurations
      await this.loadProviderConfigs();
      
      // Initialize providers
      await this.initializeProviders();
      
      // Setup key refresh monitoring
      this.setupKeyRefreshMonitoring();
      
      this.initialized = true;
      console.log('✅ LLM Provider Manager initialized');
      
      return true;
    } catch (error) {
      console.error('LLM Provider Manager initialization failed:', error);
      return false;
    }
  }

  /**
   * Load provider configurations from environment and config files
   */
  async loadProviderConfigs() {
    // Base configurations from environment
    const configs = {
      mock: {
        name: 'Demo Mode (Mock)',
        apiKey: 'mock-key',
        status: 'connected',
        available: true,
        refreshable: false
      },
      gemini: {
        name: 'Google Gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        refreshable: true,
        refreshEndpoint: 'https://oauth2.googleapis.com/token'
      },
      openai: {
        name: 'OpenAI GPT',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        refreshable: false // OpenAI keys don't expire
      },
      azure: {
        name: 'Azure OpenAI',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        refreshable: true,
        refreshEndpoint: `${process.env.AZURE_OPENAI_ENDPOINT}/oauth2/token`
      },
      openrouter: {
        name: 'OpenRouter',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        refreshable: true,
        refreshEndpoint: 'https://openrouter.ai/api/v1/auth/refresh'
      }
    };

    // Load additional config from file if exists
    try {
      const configPath = path.join(process.cwd(), 'config', 'llm-providers.json');
      const fileConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      // Merge configurations
      Object.keys(fileConfig).forEach(key => {
        if (configs[key]) {
          configs[key] = { ...configs[key], ...fileConfig[key] };
        } else {
          configs[key] = fileConfig[key];
        }
      });
    } catch (error) {
      // Config file is optional
      console.log('No additional LLM provider config file found (optional)');
    }

    // Determine availability
    Object.keys(configs).forEach(key => {
      const config = configs[key];
      if (key === 'mock') {
        config.available = true;
        config.status = 'connected';
      } else {
        config.available = !!config.apiKey;
        config.status = config.available ? 'unknown' : 'no_key';
      }
    });

    this.providerConfigs = new Map(Object.entries(configs));
  }

  /**
   * Initialize providers based on configurations
   */
  async initializeProviders() {
    const MockProvider = require('./llm-providers/mock-provider');
    const GeminiProvider = require('./llm-providers/gemini-provider');
    const OpenAIProvider = require('./llm-providers/openai-provider');
    
    for (const [key, config] of this.providerConfigs) {
      try {
        let provider;
        
        switch (key) {
          case 'mock':
            provider = new MockProvider();
            break;
          case 'gemini':
            if (config.available) {
              provider = new GeminiProvider(config.apiKey, { model: config.model });
            }
            break;
          case 'openai':
            if (config.available) {
              provider = new OpenAIProvider(config.apiKey, { model: config.model });
            }
            break;
          case 'azure':
            if (config.available && config.endpoint && config.deployment) {
              provider = new OpenAIProvider(config.apiKey, {
                baseURL: config.endpoint,
                defaultQuery: { 'api-version': '2023-12-01-preview' }
              });
            }
            break;
          case 'openrouter':
            if (config.available) {
              provider = new OpenAIProvider(config.apiKey, {
                baseURL: 'https://openrouter.ai/api/v1',
                model: config.model
              });
            }
            break;
        }

        if (provider) {
          this.providers.set(key, provider);
          
          // Test provider connection
          await this.testProvider(key);
        }
      } catch (error) {
        console.error(`Failed to initialize provider ${key}:`, error.message);
        config.status = 'error';
        config.error = error.message;
      }
    }
  }

  /**
   * Test provider connection and update status
   */
  async testProvider(providerId) {
    try {
      const provider = this.providers.get(providerId);
      const config = this.providerConfigs.get(providerId);
      
      if (!provider || !config) {
        throw new Error('Provider not found');
      }

      if (providerId === 'mock') {
        config.status = 'connected';
        return true;
      }

      // Test with simple message
      const response = await provider.generateResponse('Hello');
      
      if (response && typeof response === 'string') {
        config.status = 'connected';
        config.lastTested = new Date().toISOString();
        return true;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error(`Provider ${providerId} test failed:`, error.message);
      const config = this.providerConfigs.get(providerId);
      if (config) {
        config.status = 'error';
        config.error = error.message;
        
        // If it's an auth error, try to refresh key
        if (this.isAuthError(error) && config.refreshable) {
          console.log(`Attempting to refresh API key for ${providerId}...`);
          await this.refreshProviderKey(providerId);
        }
      }
      return false;
    }
  }

  /**
   * Setup automatic key refresh monitoring
   */
  setupKeyRefreshMonitoring() {
    // Check provider health every 5 minutes
    setInterval(async () => {
      await this.monitorProviderHealth();
    }, 5 * 60 * 1000);

    // Setup specific refresh handlers
    this.setupRefreshHandlers();
  }

  /**
   * Monitor provider health and refresh keys if needed
   */
  async monitorProviderHealth() {
    for (const [providerId, config] of this.providerConfigs) {
      if (!config.available || providerId === 'mock') continue;

      try {
        const isHealthy = await this.testProvider(providerId);
        
        if (!isHealthy && config.refreshable) {
          console.log(`Provider ${providerId} unhealthy, attempting key refresh...`);
          await this.refreshProviderKey(providerId);
        }
      } catch (error) {
        console.error(`Health check failed for ${providerId}:`, error.message);
      }
    }
  }

  /**
   * Setup provider-specific refresh handlers
   */
  setupRefreshHandlers() {
    // Gemini refresh handler
    this.keyRefreshHandlers.set('gemini', async (providedConfig) => {
      // Google API keys don't typically expire, but we can validate them
      try {
        const response = await fetch(`${providedConfig.endpoint}/${providedConfig.model}:generateContent?key=${providedConfig.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }]
          })
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error('API key invalid or expired');
        }

        return { success: true, newKey: providedConfig.apiKey };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // OpenRouter refresh handler
    this.keyRefreshHandlers.set('openrouter', async (_config) => {
      try {
        // OpenRouter doesn't have a standard refresh endpoint
        // We would need to implement their specific auth flow
        console.warn('OpenRouter key refresh not implemented - please update manually');
        return { success: false, error: 'Manual refresh required' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Azure refresh handler
    this.keyRefreshHandlers.set('azure', async (_config) => {
      try {
        // Azure OpenAI uses AAD tokens that can be refreshed
        if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
          const tokenResponse = await fetch(_config.refreshEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: process.env.AZURE_CLIENT_ID,
              client_secret: process.env.AZURE_CLIENT_SECRET,
              scope: 'https://cognitiveservices.azure.com/.default'
            })
          });

          const tokenData = await tokenResponse.json();
          
          if (tokenData.access_token) {
            return { success: true, newKey: tokenData.access_token };
          } else {
            throw new Error('No access token received');
          }
        } else {
          throw new Error('Azure credentials not configured');
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Refresh API key for a specific provider
   */
  async refreshProviderKey(providerId) {
    try {
      const config = this.providerConfigs.get(providerId);
      const refreshHandler = this.keyRefreshHandlers.get(providerId);
      
      if (!config || !refreshHandler) {
        throw new Error('Provider or refresh handler not found');
      }

      const result = await refreshHandler(config);
      
      if (result.success && result.newKey) {
        // Update configuration
        config.apiKey = result.newKey;
        config.status = 'connected';
        config.lastRefreshed = new Date().toISOString();
        
        // Reinitialize provider with new key
        await this.reinitializeProvider(providerId);
        
        console.log(`✅ Successfully refreshed API key for ${providerId}`);
        return true;
      } else {
        throw new Error(result.error || 'Key refresh failed');
      }
    } catch (error) {
      console.error(`Failed to refresh key for ${providerId}:`, error.message);
      
      // Mark provider as unavailable
      const config = this.providerConfigs.get(providerId);
      if (config) {
        config.status = 'key_expired';
        config.available = false;
        config.error = error.message;
      }
      
      return false;
    }
  }

  /**
   * Reinitialize provider with new configuration
   */
  async reinitializeProvider(providerId) {
    const config = this.providerConfigs.get(providerId);
    
    switch (providerId) {
      case 'gemini': {
        const GeminiProvider = require('./llm-providers/gemini-provider');
        this.providers.set(providerId, new GeminiProvider(config.apiKey, { model: config.model }));
        break;
      }
      case 'openai': {
        const OpenAIProvider = require('./llm-providers/openai-provider');
        this.providers.set(providerId, new OpenAIProvider(config.apiKey, { model: config.model }));
        break;
      }
      case 'azure': {
        const AzureProvider = require('./llm-providers/openai-provider');
        this.providers.set(providerId, new AzureProvider(config.apiKey, {
          baseURL: config.endpoint,
          defaultQuery: { 'api-version': '2023-12-01-preview' }
        }));
        break;
      }
      case 'openrouter': {
        const OpenRouterProvider = require('./llm-providers/openai-provider');
        this.providers.set(providerId, new OpenRouterProvider(config.apiKey, {
          baseURL: 'https://openrouter.ai/api/v1',
          model: config.model
        }));
        break;
      }
    }

    // Test the reinitialized provider
    await this.testProvider(providerId);
  }

  /**
   * Check if error is authentication-related
   */
  isAuthError(error) {
    const authErrors = [
      'unauthorized',
      'forbidden', 
      'invalid_api_key',
      'api_key_expired',
      'authentication_failed',
      '401',
      '403'
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    return authErrors.some(authError => 
      errorMessage.includes(authError) || errorCode.includes(authError)
    );
  }

  /**
   * Get best available provider with automatic fallback
   */
  async getBestProvider() {
    // Try current provider first
    if (this.providers.has(this.currentProvider)) {
      const config = this.providerConfigs.get(this.currentProvider);
      if (config?.status === 'connected') {
        return this.currentProvider;
      }
    }

    // Find first available provider in fallback order
    for (const providerId of this.fallbackOrder) {
      const config = this.providerConfigs.get(providerId);
      if (config?.available && config?.status === 'connected') {
        this.currentProvider = providerId;
        return providerId;
      }
    }

    // Fallback to mock if nothing else works
    this.currentProvider = 'mock';
    return 'mock';
  }

  /**
   * Send message with automatic provider management
   */
  async sendMessage(message, options = {}) {
    const providerId = options.provider || await this.getBestProvider();
    const provider = this.providers.get(providerId);
    const config = this.providerConfigs.get(providerId);

    if (!provider) {
      throw new Error(`Provider ${providerId} not available`);
    }

    try {
      const response = await provider.generateResponse(message, options);
      
      // Update last used timestamp
      if (config) {
        config.lastUsed = new Date().toISOString();
      }
      
      return {
        response,
        provider: providerId,
        model: config?.model
      };
    } catch (error) {
      console.error(`Provider ${providerId} failed:`, error.message);
      
      // If auth error and refreshable, try to refresh
      if (this.isAuthError(error) && config?.refreshable) {
        const refreshed = await this.refreshProviderKey(providerId);
        if (refreshed) {
          // Retry with refreshed key
          const newProvider = this.providers.get(providerId);
          const response = await newProvider.generateResponse(message, options);
          return {
            response,
            provider: providerId,
            model: config?.model,
            refreshed: true
          };
        }
      }

      // Try fallback provider
      if (providerId !== 'mock') {
        console.log(`Falling back to mock provider due to ${providerId} failure`);
        const mockProvider = this.providers.get('mock');
        const response = await mockProvider.generateResponse(message, options);
        return {
          response,
          provider: 'mock',
          fallback: true,
          originalError: error.message
        };
      }

      throw error;
    }
  }

  /**
   * Get provider status information
   */
  getProviderStatus() {
    const status = {};
    
    for (const [providerId, config] of this.providerConfigs) {
      status[providerId] = {
        name: config.name,
        available: config.available,
        status: config.status,
        model: config.model,
        lastTested: config.lastTested,
        lastUsed: config.lastUsed,
        lastRefreshed: config.lastRefreshed,
        refreshable: config.refreshable,
        error: config.error
      };
    }

    return {
      providers: status,
      current: this.currentProvider,
      fallbackOrder: this.fallbackOrder
    };
  }
}

// Singleton instance
const llmProviderManager = new LLMProviderManager();

module.exports = llmProviderManager;