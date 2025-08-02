/**
 * Phase 3 Enhanced LLM Provider Manager
 * Implements automatic failover, key rotation, and real-time monitoring
 */

const _fs = require('fs').promises;
const _path = require('path');

class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.providerConfigs = new Map();
    this.providerPool = {
      openrouter: [
        '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',
        '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',
        'sk-or-v1-3e798d593ede901dadbd0bee0b4ec69f7e90930f33b23be3c865893c2a11297dv',
        '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',
        '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',
        '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',
        'sk-or-v1-f5dc1b35427dcad76a17f5d90d552ff54d38e5d72087361be5ae3117e632c04cq',
        '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'
      ],
      gemini: [
        'AIzaSyCv8Dd_4oURTJLOyuaD7aA11wnFfytvsCkAe',
        'AIzaSyAVqHaHBRos1lRKk5hi62mC9W7ssz3bzTw',
        'AIzaSyChRuLP-xS8ucyyu1xbBiE-hrHTti_Ks5E',
        'AIzaSyBFKq4XRb505EOdPiy3O7Gt3D192siUr30',
        'AIzaSyDL5Za6UnrXtvoEVf-PbJtExiWVBAECoMg',
        'AIzaSyDWJm1cjj7dgLlPBtkXTmmU1Fsj_suGMv0',
        'AIzaSyDTCx9Zkaw8A_ncrAGAj9_6SjeOxQevBtc',
        'AIzaSyBVoVCLoniXGeNErSz4iNSWtqqoMrETg-Q'
      ]
    };
    this.currentKeyIndex = { openrouter: 0, gemini: 0 };
    this.fallbackOrder = ['gemini', 'openrouter', 'mock'];
    this.currentProvider = 'gemini';
    this.initialized = false;
    this.monitoring = false;
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      fallbacks: 0,
      keyRotations: 0
    };
  }

  /**
   * Initialize all providers with automatic key testing
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Phase 3 Provider Manager...');
      
      await this.loadProviderConfigurations();
      await this.initializeProviders();
      await this.testAllProviders();
      await this.startMonitoring();
      
      this.initialized = true;
      console.log('✅ Provider Manager fully initialized');
      console.log(`📊 Active providers: ${this.getActiveProviderCount()}/3`);
      
      return true;
    } catch (error) {
      console.error('❌ Provider Manager initialization failed:', error);
      // Always fall back to mock provider
      await this.initializeMockProvider();
      this.initialized = true;
      return false;
    }
  }

  /**
   * Load provider configurations with fresh API keys
   */
  async loadProviderConfigurations() {
    const configs = {
      mock: {
        name: 'Demo Mode (Mock)',
        type: 'mock',
        available: true,
        status: 'connected',
        model: 'mock-music-assistant',
        responseTime: 500,
        priority: 10 // Lowest priority
      },
      gemini: {
        name: 'Google Gemini 1.5 Flash',
        type: 'gemini',
        model: 'gemini-1.5-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        timeout: 10000,
        maxRetries: 3,
        priority: 1, // Highest priority
        features: ['text', 'image', 'audio'],
        costPerToken: 0.000001
      },
      openrouter: {
        name: 'OpenRouter (Multiple Models)',
        type: 'openrouter',
        model: 'anthropic/claude-3-haiku',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        timeout: 15000,
        maxRetries: 2,
        priority: 2,
        features: ['text', 'reasoning'],
        costPerToken: 0.000002
      }
    };

    // Set current API keys
    configs.gemini.apiKey = this.getCurrentKey('gemini');
    configs.openrouter.apiKey = this.getCurrentKey('openrouter');

    this.providerConfigs = new Map(Object.entries(configs));
  }

  /**
   * Get current API key for provider with rotation
   */
  getCurrentKey(providerType) {
    const keys = this.providerPool[providerType];
    if (!keys || keys.length === 0) return null;
    
    const index = this.currentKeyIndex[providerType] || 0;
    return keys[index];
  }

  /**
   * Rotate to next available API key
   */
  rotateKey(providerType) {
    const keys = this.providerPool[providerType];
    if (!keys || keys.length === 0) return null;
    
    this.currentKeyIndex[providerType] = (this.currentKeyIndex[providerType] + 1) % keys.length;
    this.stats.keyRotations++;
    
    const newKey = this.getCurrentKey(providerType);
    console.log(`🔄 Rotated ${providerType} key to index ${this.currentKeyIndex[providerType]}`);
    
    return newKey;
  }

  /**
   * Initialize all provider instances
   */
  async initializeProviders() {
    for (const [providerId, config] of this.providerConfigs) {
      try {
        await this.initializeProvider(providerId, config);
      } catch (error) {
        console.error(`Failed to initialize ${providerId}:`, error.message);
        config.status = 'error';
        config.error = error.message;
      }
    }
  }

  /**
   * Initialize a specific provider
   */
  async initializeProvider(providerId, config) {
    switch (config.type) {
      case 'mock':
        await this.initializeMockProvider();
        break;
      case 'gemini':
        await this.initializeGeminiProvider(config);
        break;
      case 'openrouter':
        await this.initializeOpenRouterProvider(config);
        break;
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  /**
   * Initialize Mock provider (always available)
   */
  async initializeMockProvider() {
    const MockProvider = require('../../chat/llm-providers/mock-provider');
    const mockProvider = new MockProvider();
    
    this.providers.set('mock', mockProvider);
    
    const config = this.providerConfigs.get('mock');
    config.status = 'connected';
    config.available = true;
    config.lastTested = new Date().toISOString();
  }

  /**
   * Initialize Gemini provider with key rotation
   */
  async initializeGeminiProvider(config) {
    const GeminiProvider = require('../../chat/llm-providers/gemini-provider');
    
    if (!config.apiKey) {
      throw new Error('No Gemini API key available');
    }
    
    const provider = new GeminiProvider({
      apiKey: config.apiKey,
      model: config.model,
      timeout: config.timeout
    });
    
    await provider.initialize();
    
    this.providers.set('gemini', provider);
    config.status = 'initialized';
  }

  /**
   * Initialize OpenRouter provider
   */
  async initializeOpenRouterProvider(config) {
    const OpenAIProvider = require('../../chat/llm-providers/openai-provider');
    
    if (!config.apiKey) {
      throw new Error('No OpenRouter API key available');
    }
    
    const provider = new OpenAIProvider({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      model: config.model,
      timeout: config.timeout,
      defaultHeaders: {
        'HTTP-Referer': 'https://echotune.ai',
        'X-Title': 'EchoTune AI Music Recommendation'
      }
    });
    
    await provider.initialize();
    
    this.providers.set('openrouter', provider);
    config.status = 'initialized';
  }

  /**
   * Test all providers and update their status
   */
  async testAllProviders() {
    console.log('🧪 Testing all providers...');
    
    for (const [providerId, config] of this.providerConfigs) {
      if (config.type === 'mock') continue; // Mock always works
      
      try {
        const isWorking = await this.testProvider(providerId);
        config.available = isWorking;
        config.status = isWorking ? 'connected' : 'failed';
        
        if (!isWorking && config.type in this.providerPool) {
          // Try rotating key and testing again
          const newKey = this.rotateKey(config.type);
          if (newKey) {
            config.apiKey = newKey;
            await this.initializeProvider(providerId, config);
            const retryWorking = await this.testProvider(providerId);
            config.available = retryWorking;
            config.status = retryWorking ? 'connected' : 'failed';
          }
        }
        
        console.log(`${isWorking || config.available ? '✅' : '❌'} ${config.name}: ${config.status}`);
      } catch (error) {
        console.error(`❌ ${config.name}: ${error.message}`);
        config.available = false;
        config.status = 'error';
        config.error = error.message;
      }
    }
  }

  /**
   * Test individual provider with timeout
   */
  async testProvider(providerId, timeout = 10000) {
    const provider = this.providers.get(providerId);
    const config = this.providerConfigs.get(providerId);
    
    if (!provider || !config) {
      throw new Error('Provider not found');
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, timeout);

      const testProvider = async () => {
        try {
          const testMessage = [{ role: 'user', content: 'Hi, please respond with just "OK" to confirm you are working.' }];
          const response = await provider.generateCompletion(testMessage);
        
          clearTimeout(timeoutId);
          
          if (response && response.content && typeof response.content === 'string' && response.content.length > 0) {
            config.lastTested = new Date().toISOString();
            config.responseTime = Date.now() - (config.testStartTime || Date.now());
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          config.error = error.message;
          resolve(false);
        }
      };
      
      testProvider();
    });
  }

  /**
   * Get the best available provider based on priority and status
   */
  getBestProvider() {
    // Sort providers by priority (lower number = higher priority)
    const sortedProviders = Array.from(this.providerConfigs.entries())
      .filter(([_, config]) => config.available && config.status === 'connected')
      .sort(([_, a], [__, b]) => a.priority - b.priority);

    if (sortedProviders.length > 0) {
      const [providerId] = sortedProviders[0];
      this.currentProvider = providerId;
      return providerId;
    }

    // Fallback to mock if nothing else works
    this.currentProvider = 'mock';
    return 'mock';
  }

  /**
   * Send message with automatic provider management and fallback
   */
  async sendMessage(message, options = {}) {
    this.stats.requests++;
    const startTime = Date.now();
    
    let providerId = options.provider || this.getBestProvider();
    let attemptCount = 0;
    const maxAttempts = 3;

    while (attemptCount < maxAttempts) {
      try {
        const provider = this.providers.get(providerId);
        const config = this.providerConfigs.get(providerId);

        if (!provider) {
          throw new Error(`Provider ${providerId} not available`);
        }

        // Format message for provider
        const messages = [{ 
          role: 'user', 
          content: message 
        }];

        const response = await provider.generateCompletion(messages, options);
        
        // Success
        this.stats.successes++;
        config.lastUsed = new Date().toISOString();
        config.usageCount = (config.usageCount || 0) + 1;
        
        return {
          response: response.content || response,
          provider: providerId,
          model: config.model,
          responseTime: Date.now() - startTime,
          attempt: attemptCount + 1,
          usage: response.usage || {},
          metadata: response.metadata || {}
        };

      } catch (error) {
        attemptCount++;
        console.error(`Attempt ${attemptCount} failed for ${providerId}:`, error.message);
        
        const config = this.providerConfigs.get(providerId);
        
        // If it's an auth error, try rotating key
        if (this.isAuthError(error) && config.type in this.providerPool) {
          console.log(`🔄 Auth error detected, rotating ${config.type} key...`);
          const newKey = this.rotateKey(config.type);
          if (newKey) {
            config.apiKey = newKey;
            await this.initializeProvider(providerId, config);
            continue; // Retry with new key
          }
        }
        
        // Try next provider in fallback order
        if (attemptCount < maxAttempts) {
          const nextProvider = this.getNextFallbackProvider(providerId);
          if (nextProvider !== providerId) {
            providerId = nextProvider;
            this.stats.fallbacks++;
            console.log(`🔄 Falling back to ${providerId}`);
            continue;
          }
        }
        
        // Last attempt failed
        if (attemptCount >= maxAttempts) {
          this.stats.failures++;
          
          // Final fallback to mock
          if (providerId !== 'mock') {
            const mockProvider = this.providers.get('mock');
            if (mockProvider) {
              const messages = [{ role: 'user', content: message }];
              const response = await mockProvider.generateCompletion(messages, options);
              return {
                response: response.content || response,
                provider: 'mock',
                model: 'mock-music-assistant',
                fallback: true,
                originalError: error.message,
                responseTime: Date.now() - startTime,
                usage: response.usage || {},
                metadata: response.metadata || {}
              };
            }
          }
          
          throw error;
        }
      }
    }
  }

  /**
   * Get next provider in fallback order
   */
  getNextFallbackProvider(currentProviderId) {
    const currentIndex = this.fallbackOrder.indexOf(currentProviderId);
    const nextIndex = (currentIndex + 1) % this.fallbackOrder.length;
    
    const nextProviderId = this.fallbackOrder[nextIndex];
    const nextConfig = this.providerConfigs.get(nextProviderId);
    
    if (nextConfig?.available && nextConfig?.status === 'connected') {
      return nextProviderId;
    }
    
    // Find any available provider
    for (const fallbackId of this.fallbackOrder) {
      const config = this.providerConfigs.get(fallbackId);
      if (config?.available && config?.status === 'connected') {
        return fallbackId;
      }
    }
    
    return 'mock'; // Ultimate fallback
  }

  /**
   * Check if error is authentication-related
   */
  isAuthError(error) {
    const authErrors = [
      'unauthorized', 'forbidden', 'invalid_api_key', 'api_key_expired',
      'authentication_failed', '401', '403', 'invalid_request_error'
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return authErrors.some(authError => errorMessage.includes(authError));
  }

  /**
   * Start real-time monitoring
   */
  async startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    console.log('📊 Starting provider monitoring...');
    
    // Health check every 2 minutes
    setInterval(async () => {
      await this.performHealthCheck();
    }, 2 * 60 * 1000);
    
    // Statistics logging every 5 minutes
    setInterval(() => {
      this.logStatistics();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform health check on all providers
   */
  async performHealthCheck() {
    for (const [providerId, config] of this.providerConfigs) {
      if (config.type === 'mock' || !config.available) continue;
      
      const isHealthy = await this.testProvider(providerId, 5000);
      
      if (!isHealthy && config.status === 'connected') {
        console.log(`⚠️ Provider ${providerId} health check failed`);
        config.status = 'unhealthy';
        
        // Try rotating key if applicable
        if (config.type in this.providerPool) {
          const newKey = this.rotateKey(config.type);
          if (newKey) {
            config.apiKey = newKey;
            await this.initializeProvider(providerId, config);
            
            // Test again with new key
            const retryHealthy = await this.testProvider(providerId, 5000);
            config.status = retryHealthy ? 'connected' : 'failed';
          }
        }
      } else if (isHealthy && config.status !== 'connected') {
        console.log(`✅ Provider ${providerId} recovered`);
        config.status = 'connected';
      }
    }
  }

  /**
   * Log performance statistics
   */
  logStatistics() {
    const successRate = this.stats.requests > 0 ? 
      ((this.stats.successes / this.stats.requests) * 100).toFixed(1) : 0;
    
    console.log('📊 Provider Statistics:');
    console.log(`   Requests: ${this.stats.requests}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Fallbacks: ${this.stats.fallbacks}`);
    console.log(`   Key Rotations: ${this.stats.keyRotations}`);
    console.log(`   Active Providers: ${this.getActiveProviderCount()}/3`);
  }

  /**
   * Get number of active providers
   */
  getActiveProviderCount() {
    return Array.from(this.providerConfigs.values())
      .filter(config => config.available && config.status === 'connected').length;
  }

  /**
   * Get comprehensive provider status
   */
  getStatus() {
    const providers = {};
    
    for (const [providerId, config] of this.providerConfigs) {
      providers[providerId] = {
        name: config.name,
        type: config.type,
        available: config.available,
        status: config.status,
        model: config.model,
        priority: config.priority,
        responseTime: config.responseTime,
        lastTested: config.lastTested,
        lastUsed: config.lastUsed,
        usageCount: config.usageCount || 0,
        error: config.error,
        features: config.features
      };
    }

    return {
      initialized: this.initialized,
      monitoring: this.monitoring,
      currentProvider: this.currentProvider,
      activeProviders: this.getActiveProviderCount(),
      totalProviders: this.providerConfigs.size,
      fallbackOrder: this.fallbackOrder,
      providers,
      statistics: this.stats,
      keyPool: {
        openrouter: {
          total: this.providerPool.openrouter.length,
          current: this.currentKeyIndex.openrouter
        },
        gemini: {
          total: this.providerPool.gemini.length,
          current: this.currentKeyIndex.gemini
        }
      }
    };
  }
}

// Export singleton instance
module.exports = new ProviderManager();