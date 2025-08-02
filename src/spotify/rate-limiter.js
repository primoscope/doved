/**
 * Rate Limiter for Spotify API
 * Handles API rate limiting and request throttling
 */
class RateLimiter {
  constructor(options = {}) {
    this.requestsPerSecond = options.requestsPerSecond || 10; // Conservative rate
    this.requestsPerMinute = options.requestsPerMinute || 300; // Spotify limit
    this.burstLimit = options.burstLimit || 20; // Burst allowance
    
    this.requests = []; // Timestamp array for tracking requests
    this.isBlocked = false;
    this.blockUntil = null;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      averageDelay: 0
    };
  }

  /**
   * Check if request can proceed or needs to wait
   */
  async checkLimit() {
    const now = Date.now();
    
    // Check if we're in a blocked state
    if (this.isBlocked && this.blockUntil && now < this.blockUntil) {
      const waitTime = this.blockUntil - now;
      console.log(`Rate limited, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      this.isBlocked = false;
      this.blockUntil = null;
    }

    // Clean old requests (older than 1 minute)
    const oneMinuteAgo = now - 60 * 1000;
    this.requests = this.requests.filter(timestamp => timestamp > oneMinuteAgo);

    // Check minute limit
    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = oldestRequest + 60 * 1000 - now + 100; // Add small buffer
      
      if (waitTime > 0) {
        console.log(`Minute rate limit reached, waiting ${waitTime}ms`);
        this.stats.blockedRequests++;
        await this.delay(waitTime);
        return this.checkLimit(); // Recheck after delay
      }
    }

    // Check second limit
    const oneSecondAgo = now - 1000;
    const recentRequests = this.requests.filter(timestamp => timestamp > oneSecondAgo);
    
    if (recentRequests.length >= this.requestsPerSecond) {
      const waitTime = Math.max(1000 / this.requestsPerSecond, 100);
      console.log(`Second rate limit reached, waiting ${waitTime}ms`);
      this.stats.blockedRequests++;
      await this.delay(waitTime);
    }

    // Record this request
    this.requests.push(now);
    this.stats.totalRequests++;
  }

  /**
   * Add explicit delay (for 429 responses)
   */
  async addDelay(milliseconds) {
    this.isBlocked = true;
    this.blockUntil = Date.now() + milliseconds;
    console.log(`Adding explicit delay of ${milliseconds}ms due to rate limiting`);
    await this.delay(milliseconds);
    this.isBlocked = false;
    this.blockUntil = null;
  }

  /**
   * Simple delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limiter statistics
   */
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const activeRequests = this.requests.filter(timestamp => timestamp > oneMinuteAgo);
    
    return {
      ...this.stats,
      currentRequestsPerMinute: activeRequests.length,
      isBlocked: this.isBlocked,
      blockUntil: this.blockUntil
    };
  }

  /**
   * Reset rate limiter state
   */
  reset() {
    this.requests = [];
    this.isBlocked = false;
    this.blockUntil = null;
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      averageDelay: 0
    };
  }

  /**
   * Calculate optimal batch size based on current rate
   */
  getOptimalBatchSize(totalItems, timeLimit = 60000) {
    const availableRequestsPerMinute = Math.max(this.requestsPerMinute - this.requests.length, 10);
    const timeRemaining = timeLimit;
    // Note: requestsPerItem calculation available for future enhancement
    
    return Math.min(
      availableRequestsPerMinute,
      Math.floor(totalItems / (timeRemaining / 60000)),
      100 // Max batch size
    );
  }
}

module.exports = RateLimiter;