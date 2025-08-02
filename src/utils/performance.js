/**
 * Performance optimization utilities for EchoTune AI
 * Includes caching, memory management, and performance monitoring
 */

const { performance } = require('perf_hooks');

class PerformanceManager {
  constructor() {
    // Initialize in-memory cache
    this.cache = new Map();
    this.cacheTTL = new Map();
    
    // Performance metrics
    this.metrics = {
      requests: 0,
      totalResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0
    };
    
    // Memory monitoring
    this.memoryThreshold = 500 * 1024 * 1024; // 500MB
    this.monitoringInterval = null;
    
    this.startMonitoring();
  }

  /**
   * Cache wrapper for API responses
   */
  async cacheWrapper(key, fetchFunction, ttl = 1800000, options = {}) {
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cached = this.getFromCache(key);
      if (cached && !options.forceRefresh) {
        this.metrics.cacheHits++;
        this.updateMetrics(performance.now() - startTime);
        return cached;
      }
      
      // Fetch fresh data
      this.metrics.cacheMisses++;
      const result = await fetchFunction();
      
      // Cache the result
      this.setCache(key, result, ttl);
      
      this.updateMetrics(performance.now() - startTime);
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics(performance.now() - startTime);
      throw error;
    }
  }

  /**
   * Set cache with TTL
   */
  setCache(key, value, ttl = 1800000) {
    this.cache.set(key, value);
    this.cacheTTL.set(key, Date.now() + ttl);
  }

  /**
   * Get from cache with TTL check
   */
  getFromCache(key) {
    const expiry = this.cacheTTL.get(key);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheTTL.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  /**
   * Clear cache by pattern
   */
  clearCachePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.cacheTTL.delete(key);
      }
    }
  }

  /**
   * Performance monitoring middleware
   */
  createPerformanceMiddleware() {
    return (req, res, next) => {
      const startTime = performance.now();
      
      // Add performance helpers to request
      req.performance = {
        start: startTime,
        mark: (label) => performance.mark(`${req.url}-${label}`),
        measure: (name, start, end) => performance.measure(name, start, end)
      };
      
      // Track response time
      res.on('finish', () => {
        const duration = performance.now() - startTime;
        this.updateMetrics(duration);
        
        // Log slow requests
        if (duration > 1000) {
          console.warn(`Slow request: ${req.method} ${req.url} - ${duration.toFixed(2)}ms`);
        }
      });
      
      next();
    };
  }

  /**
   * Memory optimization for large datasets
   */
  optimizeMemoryUsage() {
    // Clear expired cache entries
    const now = Date.now();
    for (const [key, expiry] of this.cacheTTL.entries()) {
      if (now > expiry) {
        this.cache.delete(key);
        this.cacheTTL.delete(key);
      }
    }
    
    // Run garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    console.log('Memory optimization completed:', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024 * 100) / 100} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100} MB`
    });
  }

  /**
   * Start memory and performance monitoring
   */
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      
      // Check memory threshold
      if (memUsage.heapUsed > this.memoryThreshold) {
        console.warn('High memory usage detected, running optimization...');
        this.optimizeMemoryUsage();
      }
      
      // Log performance metrics every 100 requests
      if (this.metrics.requests % 100 === 0 && this.metrics.requests > 0) {
        this.logPerformanceMetrics();
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(responseTime) {
    this.metrics.requests++;
    this.metrics.totalResponseTime += responseTime;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const avgResponseTime = this.metrics.requests > 0 
      ? this.metrics.totalResponseTime / this.metrics.requests 
      : 0;
    
    const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
      : 0;
    
    return {
      requests: this.metrics.requests,
      averageResponseTime: Math.round(avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0,
      memoryUsage: process.memoryUsage(),
      cacheStats: {
        entries: this.cache.size,
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses
      }
    };
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics() {
    const stats = this.getStats();
    console.log('📊 Performance Metrics:', {
      requests: stats.requests,
      avgResponseTime: `${stats.averageResponseTime}ms`,
      cacheHitRate: `${stats.cacheHitRate}%`,
      errorRate: `${stats.errorRate}%`,
      memoryUsage: `${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)}MB`
    });
  }

  /**
   * Health check for performance
   */
  healthCheck() {
    const stats = this.getStats();
    const memUsage = stats.memoryUsage;
    
    const isHealthy = 
      stats.averageResponseTime < 500 && // Response time under 500ms
      stats.errorRate < 5 && // Error rate under 5%
      memUsage.heapUsed < this.memoryThreshold; // Memory under threshold
    
    return {
      healthy: isHealthy,
      metrics: stats,
      recommendations: this.getPerformanceRecommendations(stats)
    };
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(stats) {
    const recommendations = [];
    
    if (stats.averageResponseTime > 500) {
      recommendations.push('Consider optimizing slow endpoints or adding more caching');
    }
    
    if (stats.cacheHitRate < 50) {
      recommendations.push('Cache hit rate is low, review caching strategy');
    }
    
    if (stats.errorRate > 5) {
      recommendations.push('High error rate detected, review error handling');
    }
    
    if (stats.memoryUsage.heapUsed > this.memoryThreshold) {
      recommendations.push('High memory usage, consider memory optimization');
    }
    
    return recommendations;
  }
}

/**
 * Advanced rate limiting with adaptive thresholds
 */
class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.baseLimit = options.baseLimit || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.adaptiveThreshold = options.adaptiveThreshold || 0.8;
    
    this.requests = new Map();
    this.performanceManager = options.performanceManager;
  }

  /**
   * Create adaptive rate limiting middleware
   */
  createMiddleware() {
    return (req, res, next) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      // Clean old entries
      this.cleanup(now);
      
      // Get user request history
      let userRequests = this.requests.get(key);
      if (!userRequests) {
        userRequests = [];
        this.requests.set(key, userRequests);
      }
      
      // Remove old requests outside window
      userRequests = userRequests.filter(timestamp => now - timestamp < this.windowMs);
      this.requests.set(key, userRequests);
      
      // Calculate adaptive limit based on system performance
      const adaptiveLimit = this.calculateAdaptiveLimit();
      
      if (userRequests.length >= adaptiveLimit) {
        const retryAfter = Math.ceil((userRequests[0] + this.windowMs - now) / 1000);
        
        res.set({
          'X-RateLimit-Limit': adaptiveLimit,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': new Date(userRequests[0] + this.windowMs),
          'Retry-After': retryAfter
        });
        
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter: retryAfter
        });
      }
      
      // Add current request
      userRequests.push(now);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': adaptiveLimit,
        'X-RateLimit-Remaining': Math.max(0, adaptiveLimit - userRequests.length),
        'X-RateLimit-Reset': new Date(now + this.windowMs)
      });
      
      next();
    };
  }

  /**
   * Calculate adaptive limit based on system performance
   */
  calculateAdaptiveLimit() {
    if (!this.performanceManager) {
      return this.baseLimit;
    }
    
    const stats = this.performanceManager.getStats();
    
    // Reduce limit if system is under stress
    if (stats.averageResponseTime > 1000 || stats.errorRate > 10) {
      return Math.floor(this.baseLimit * 0.5);
    } else if (stats.averageResponseTime > 500 || stats.errorRate > 5) {
      return Math.floor(this.baseLimit * 0.75);
    } else if (stats.averageResponseTime < 100 && stats.errorRate < 1) {
      return Math.floor(this.baseLimit * 1.25);
    }
    
    return this.baseLimit;
  }

  /**
   * Get rate limiting key for request
   */
  getKey(req) {
    // Use IP address and user ID if available
    const userId = req.userId || req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  /**
   * Cleanup old entries
   */
  cleanup(now) {
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(timestamp => now - timestamp < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

module.exports = {
  PerformanceManager,
  AdaptiveRateLimiter
};