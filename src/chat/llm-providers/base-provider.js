/**
 * Base LLM Provider Interface
 * Abstract class for all LLM providers
 */
class BaseLLMProvider {
  constructor(config) {
    this.config = config;
    this.name = this.constructor.name;
    this.isInitialized = false;
  }

  /**
   * Initialize the provider
   */
  async initialize() {
    this.isInitialized = true;
  }

  /**
   * Generate chat completion
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Generation options
   * @returns {Object} Response object
   */
  async generateCompletion() {
    throw new Error('generateCompletion must be implemented by subclass');
  }

  /**
   * Generate streaming completion
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Generation options
   * @returns {AsyncGenerator} Stream of response chunks
   */
  async* generateStreamingCompletion() {
    throw new Error('generateStreamingCompletion must be implemented by subclass');
    // eslint-disable-next-line no-unreachable
    yield; // This will never execute but satisfies the generator requirement
  }

  /**
   * Check if provider is available and configured
   */
  isAvailable() {
    return this.isInitialized && this.config && this.validateConfig();
  }

  /**
   * Validate provider configuration
   */
  validateConfig() {
    throw new Error('validateConfig must be implemented by subclass');
  }

  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      streaming: false,
      functionCalling: false,
      maxTokens: 4096,
      supportedModels: []
    };
  }

  /**
   * Format messages for provider
   */
  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Parse response from provider
   */
  parseResponse(response) {
    return {
      content: response.content || '',
      role: 'assistant',
      model: response.model || 'unknown',
      usage: response.usage || {},
      metadata: response.metadata || {}
    };
  }

  /**
   * Handle errors from provider
   */
  handleError(error) {
    console.error(`${this.name} error:`, error);
    return {
      error: true,
      message: error.message || 'Unknown error occurred',
      provider: this.name
    };
  }

  /**
   * Get token count estimate
   */
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

module.exports = BaseLLMProvider;