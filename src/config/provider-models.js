/**
 * Comprehensive Provider and Model Configuration
 * Contains all available models for each LLM provider with their capabilities
 */

const PROVIDER_MODELS = {
  openai: {
    name: 'OpenAI',
    description: 'Advanced GPT models with function calling and streaming support',
    website: 'https://openai.com/',
    apiKeyFormat: 'sk-',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most advanced multimodal model with vision capabilities',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling', 'vision'],
        cost: 'high',
        speed: 'fast'
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Faster, more affordable version of GPT-4o',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling', 'vision'],
        cost: 'medium',
        speed: 'very_fast'
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Latest GPT-4 model with improved performance',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'fast'
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'High-intelligence flagship model for complex tasks',
        maxTokens: 8192,
        contextWindow: 8192,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'medium'
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast, inexpensive model for simple tasks',
        maxTokens: 16384,
        contextWindow: 16384,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'low',
        speed: 'very_fast'
      }
    ]
  },

  gemini: {
    name: 'Google Gemini',
    description: 'Google\'s advanced AI models with multimodal capabilities',
    website: 'https://ai.google.dev/',
    apiKeyFormat: 'AIza',
    models: [
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Most capable model with 1M+ token context window',
        maxTokens: 1048576,
        contextWindow: 1048576,
        features: ['chat', 'streaming', 'vision', 'code_execution'],
        cost: 'high',
        speed: 'medium'
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Fast and versatile model for diverse tasks',
        maxTokens: 1048576,
        contextWindow: 1048576,
        features: ['chat', 'streaming', 'vision'],
        cost: 'medium',
        speed: 'fast'
      },
      {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        description: 'Best model for complex reasoning tasks',
        maxTokens: 32768,
        contextWindow: 32768,
        features: ['chat', 'streaming'],
        cost: 'medium',
        speed: 'medium'
      },
      {
        id: 'gemini-pro-vision',
        name: 'Gemini Pro Vision',
        description: 'Gemini Pro with image understanding capabilities',
        maxTokens: 16384,
        contextWindow: 16384,
        features: ['chat', 'vision'],
        cost: 'medium',
        speed: 'medium'
      }
    ]
  },

  openrouter: {
    name: 'OpenRouter',
    description: 'Access to multiple AI models through a unified API',
    website: 'https://openrouter.ai/',
    apiKeyFormat: 'sk-or-',
    models: [
      // OpenAI Models via OpenRouter
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (OpenRouter)',
        description: 'OpenAI\'s most advanced model via OpenRouter',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'fast',
        provider: 'OpenAI'
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini (OpenRouter)',
        description: 'Affordable GPT-4o variant via OpenRouter',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'medium',
        speed: 'very_fast',
        provider: 'OpenAI'
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo (OpenRouter)',
        description: 'Fast and efficient model via OpenRouter',
        maxTokens: 16384,
        contextWindow: 16384,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'low',
        speed: 'very_fast',
        provider: 'OpenAI'
      },
      // Anthropic Models
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Anthropic\'s most intelligent model',
        maxTokens: 200000,
        contextWindow: 200000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'fast',
        provider: 'Anthropic'
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Fast and affordable Claude model',
        maxTokens: 200000,
        contextWindow: 200000,
        features: ['chat', 'streaming'],
        cost: 'low',
        speed: 'very_fast',
        provider: 'Anthropic'
      },
      // Meta Models
      {
        id: 'meta-llama/llama-3.1-405b-instruct',
        name: 'Llama 3.1 405B Instruct',
        description: 'Meta\'s largest and most capable open model',
        maxTokens: 131072,
        contextWindow: 131072,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'medium',
        provider: 'Meta'
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B Instruct',
        description: 'Balanced performance and efficiency',
        maxTokens: 131072,
        contextWindow: 131072,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'medium',
        speed: 'fast',
        provider: 'Meta'
      },
      {
        id: 'meta-llama/llama-3.1-8b-instruct:free',
        name: 'Llama 3.1 8B Instruct (Free)',
        description: 'Free tier Llama model with good performance',
        maxTokens: 131072,
        contextWindow: 131072,
        features: ['chat', 'streaming'],
        cost: 'free',
        speed: 'fast',
        provider: 'Meta'
      },
      // DeepSeek Models
      {
        id: 'deepseek/deepseek-r1-distill-llama-70b',
        name: 'DeepSeek R1 Distill Llama 70B',
        description: 'Advanced reasoning model from DeepSeek',
        maxTokens: 65536,
        contextWindow: 65536,
        features: ['chat', 'streaming', 'reasoning'],
        cost: 'medium',
        speed: 'fast',
        provider: 'DeepSeek'
      },
      {
        id: 'deepseek/deepseek-r1-0528:free',
        name: 'DeepSeek R1 (Free)',
        description: 'Free reasoning-capable model',
        maxTokens: 65536,
        contextWindow: 65536,
        features: ['chat', 'streaming', 'reasoning'],
        cost: 'free',
        speed: 'medium',
        provider: 'DeepSeek'
      },
      // Google Models via OpenRouter
      {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (Free)',
        description: 'Free Gemini model with experimental features',
        maxTokens: 1048576,
        contextWindow: 1048576,
        features: ['chat', 'streaming', 'vision'],
        cost: 'free',
        speed: 'fast',
        provider: 'Google'
      },
      // Mistral Models
      {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        description: 'Mistral\'s flagship model for complex tasks',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'fast',
        provider: 'Mistral'
      },
      {
        id: 'mistralai/mistral-medium',
        name: 'Mistral Medium',
        description: 'Balanced performance for most use cases',
        maxTokens: 32768,
        contextWindow: 32768,
        features: ['chat', 'streaming'],
        cost: 'medium',
        speed: 'fast',
        provider: 'Mistral'
      }
    ]
  },

  azure: {
    name: 'Azure OpenAI',
    description: 'OpenAI models hosted on Microsoft Azure',
    website: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
    apiKeyFormat: '',
    requiresEndpoint: true,
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Azure)',
        description: 'GPT-4o deployed on Azure',
        maxTokens: 128000,
        contextWindow: 128000,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'fast'
      },
      {
        id: 'gpt-4',
        name: 'GPT-4 (Azure)',
        description: 'GPT-4 deployed on Azure',
        maxTokens: 8192,
        contextWindow: 8192,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'high',
        speed: 'medium'
      },
      {
        id: 'gpt-35-turbo',
        name: 'GPT-3.5 Turbo (Azure)',
        description: 'GPT-3.5 Turbo deployed on Azure',
        maxTokens: 16384,
        contextWindow: 16384,
        features: ['chat', 'streaming', 'function_calling'],
        cost: 'low',
        speed: 'very_fast'
      }
    ]
  },

  mock: {
    name: 'Mock Provider',
    description: 'Demo provider with realistic responses (no API key required)',
    website: null,
    apiKeyFormat: null,
    models: [
      {
        id: 'mock-music-assistant',
        name: 'Mock Music Assistant',
        description: 'Intelligent music recommendation chatbot for demo purposes',
        maxTokens: 4096,
        contextWindow: 4096,
        features: ['chat', 'music_recommendations', 'demo'],
        cost: 'free',
        speed: 'very_fast'
      },
      {
        id: 'mock-general-assistant',
        name: 'Mock General Assistant',
        description: 'General-purpose assistant for testing',
        maxTokens: 4096,
        contextWindow: 4096,
        features: ['chat', 'demo'],
        cost: 'free',
        speed: 'very_fast'
      }
    ]
  }
};

/**
 * Feature definitions
 */
const FEATURES = {
  chat: { name: 'Chat', icon: '💬', description: 'Text-based conversation' },
  streaming: { name: 'Streaming', icon: '⚡', description: 'Real-time response streaming' },
  function_calling: { name: 'Function Calling', icon: '🔧', description: 'Can call external functions' },
  vision: { name: 'Vision', icon: '👁️', description: 'Can analyze images' },
  code_execution: { name: 'Code Execution', icon: '💻', description: 'Can execute code' },
  reasoning: { name: 'Advanced Reasoning', icon: '🧠', description: 'Enhanced logical reasoning' },
  music_recommendations: { name: 'Music Recommendations', icon: '🎵', description: 'Specialized music suggestions' },
  demo: { name: 'Demo Mode', icon: '🎭', description: 'Demo/testing purposes' }
};

/**
 * Cost level definitions
 */
const COST_LEVELS = {
  free: { name: 'Free', color: '#1db954', icon: '🆓' },
  low: { name: 'Low Cost', color: '#f39c12', icon: '💰' },
  medium: { name: 'Medium Cost', color: '#e67e22', icon: '💰💰' },
  high: { name: 'High Cost', color: '#e74c3c', icon: '💰💰💰' }
};

/**
 * Speed level definitions
 */
const SPEED_LEVELS = {
  very_fast: { name: 'Very Fast', color: '#1db954', icon: '🚀' },
  fast: { name: 'Fast', color: '#27ae60', icon: '⚡' },
  medium: { name: 'Medium', color: '#f39c12', icon: '🐕' },
  slow: { name: 'Slow', color: '#e74c3c', icon: '🐌' }
};

/**
 * Get all providers
 */
function getAllProviders() {
  return Object.keys(PROVIDER_MODELS).map(id => ({
    id,
    ...PROVIDER_MODELS[id]
  }));
}

/**
 * Get models for a specific provider
 */
function getModelsForProvider(providerId) {
  return PROVIDER_MODELS[providerId]?.models || [];
}

/**
 * Search models across all providers
 */
function searchModels(query, providerId = null) {
  const providers = providerId ? [providerId] : Object.keys(PROVIDER_MODELS);
  const results = [];

  providers.forEach(pid => {
    const models = getModelsForProvider(pid);
    models.forEach(model => {
      if (
        model.name.toLowerCase().includes(query.toLowerCase()) ||
        model.description.toLowerCase().includes(query.toLowerCase()) ||
        model.id.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          ...model,
          providerId: pid,
          providerName: PROVIDER_MODELS[pid].name
        });
      }
    });
  });

  return results;
}

/**
 * Get model by ID and provider
 */
function getModel(providerId, modelId) {
  const models = getModelsForProvider(providerId);
  return models.find(model => model.id === modelId);
}

/**
 * Validate provider configuration
 */
function validateProviderConfig(providerId, config) {
  const provider = PROVIDER_MODELS[providerId];
  if (!provider) return { valid: false, error: 'Unknown provider' };

  // Mock provider doesn't need validation
  if (providerId === 'mock') return { valid: true };

  // Check API key format
  if (provider.apiKeyFormat && config.apiKey) {
    if (!config.apiKey.startsWith(provider.apiKeyFormat)) {
      return { 
        valid: false, 
        error: `API key should start with "${provider.apiKeyFormat}"` 
      };
    }
  }

  // Check required endpoint for Azure
  if (provider.requiresEndpoint && !config.endpoint) {
    return { 
      valid: false, 
      error: 'Endpoint URL is required for Azure OpenAI' 
    };
  }

  return { valid: true };
}

module.exports = {
  PROVIDER_MODELS,
  FEATURES,
  COST_LEVELS,
  SPEED_LEVELS,
  getAllProviders,
  getModelsForProvider,
  searchModels,
  getModel,
  validateProviderConfig
};