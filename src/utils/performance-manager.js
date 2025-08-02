/**
 * Performance Optimization Manager for EchoTune AI
 * Provides intelligent caching, rate limiting, and performance monitoring
 */

class PerformanceManager {
  constructor() {
    this.cacheStorage = new Map();
    this.rateLimiters = new Map();
    this.performanceMetrics = {
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      errorRate: 0
    };
    
    this.config = {
      cache: {
        defaultTTL: 5 * 60 * 1000, // 5 minutes
        maxSize: 1000,
        prefetchThreshold: 0.8 // Start prefetching when 80% of TTL elapsed
      },
      rateLimit: {
        spotifyAPI: { requests: 100, window: 60000 }, // 100 req/min
        openAI: { requests: 60, window: 60000 }, // 60 req/min
        general: { requests: 1000, window: 60000 } // 1000 req/min
      },
      performance: {
        slowRequestThreshold: 2000, // 2 seconds
        memoryThreshold: 50 * 1024 * 1024, // 50MB
        cpuThreshold: 80 // 80% CPU usage
      }
    };

    this.initializePerformanceMonitoring();
  }

  /**
   * Initialize performance monitoring
   */
  initializePerformanceMonitoring() {
    // Memory usage monitoring
    if (performance.memory) {
      setInterval(() => {
        this.checkMemoryUsage();
      }, 30000); // Check every 30 seconds
    }

    // Performance observer for measuring API timing
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.recordPerformanceMetric(entry);
        });
      });
      observer.observe({ entryTypes: ['measure', 'navigation'] });
    }

    // Service worker for offline caching
    this.initializeServiceWorker();
    
    // Initialize cache methods
    this.cache = this.createCacheManager();
  }

  /**
   * Create cache management methods
   */
  createCacheManager() {
    return {
      set: (key, value, options = {}) => {
        const ttl = options.ttl || this.config.cache.defaultTTL;
        const priority = options.priority || 1;
        const prefetchable = options.prefetchable || false;
        
        // Evict LRU items if cache is full
        if (this.cacheStorage.size >= this.config.cache.maxSize) {
          this.evictLRUItems();
        }
        
        const cacheEntry = {
          value,
          createdAt: Date.now(),
          expiresAt: Date.now() + ttl,
          accessCount: 0,
          lastAccessed: Date.now(),
          priority,
          prefetchable,
          size: this.calculateObjectSize(value)
        };
        
        this.cacheStorage.set(key, cacheEntry);
        
        // Set up prefetch if enabled
        if (prefetchable && options.prefetchFn) {
          setTimeout(() => {
            this.prefetchIfNeeded(key, options.prefetchFn);
          }, ttl * this.config.cache.prefetchThreshold);
        }
        
        return true;
      },

      get: (key) => {
        const entry = this.cacheStorage.get(key);
        
        if (!entry) {
          this.performanceMetrics.cacheMisses++;
          return null;
        }
        
        // Check expiration
        if (Date.now() > entry.expiresAt) {
          this.cacheStorage.delete(key);
          this.performanceMetrics.cacheMisses++;
          return null;
        }
        
        // Update access stats
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        
        this.performanceMetrics.cacheHits++;
        return entry.value;
      },

      has: (key) => {
        const entry = this.cacheStorage.get(key);
        return entry && Date.now() <= entry.expiresAt;
      },

      delete: (key) => {
        return this.cacheStorage.delete(key);
      },

      clear: () => {
        this.cacheStorage.clear();
      },

      getStats: () => {
        let totalSize = 0;
        let expiredCount = 0;
        const now = Date.now();
        
        this.cacheStorage.forEach((entry) => {
          totalSize += entry.size;
          if (now > entry.expiresAt) {
            expiredCount++;
          }
        });
        
        return {
          entries: this.cacheStorage.size,
          totalSize,
          expiredCount,
          hitRate: this.performanceMetrics.cacheHits / 
                  (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0
        };
      }
    };
  }

  /**
>>>>>>> 1e0d5360242314d703de74bc50f71e0cb63d6a0b
   * Advanced rate limiting with sliding window
   */
  createRateLimiter(name, options = {}) {
    const config = {
      requests: options.requests || this.config.rateLimit.general.requests,
      window: options.window || this.config.rateLimit.general.window,
      strategy: options.strategy || 'sliding_window'
    };
    
    const limiter = {
      requests: [],
      
      isAllowed: () => {
        const now = Date.now();
        
        // Clean old requests
        limiter.requests = limiter.requests.filter(
          timestamp => now - timestamp < config.window
        );
        
        // Check if under limit
        if (limiter.requests.length < config.requests) {
          limiter.requests.push(now);
          return { allowed: true, resetTime: null };
        }
        
        // Calculate reset time
        const oldestRequest = Math.min(...limiter.requests);
        const resetTime = oldestRequest + config.window;
        
        return { 
          allowed: false, 
          resetTime,
          retryAfter: resetTime - now
        };
      },
      
      getStatus: () => {
        const now = Date.now();
        limiter.requests = limiter.requests.filter(
          timestamp => now - timestamp < config.window
        );
        
        return {
          remaining: Math.max(0, config.requests - limiter.requests.length),
          total: config.requests,
          resetTime: limiter.requests.length > 0 
            ? Math.min(...limiter.requests) + config.window 
            : null
        };
      }
    };
    
    this.rateLimiters.set(name, limiter);
    return limiter;
  }

  /**
   * Rate-limited API request wrapper
   */
  async rateLimitedRequest(limiterName, requestFn, options = {}) {
    const limiter = this.rateLimiters.get(limiterName) || 
                   this.createRateLimiter(limiterName, options);
    
    const { allowed, retryAfter } = limiter.isAllowed();
    
    if (!allowed) {
      if (options.waitForReset) {
        await this.sleep(retryAfter);
        return this.rateLimitedRequest(limiterName, requestFn, options);
      } else {
        throw new Error(`Rate limit exceeded for ${limiterName}. Retry after ${retryAfter}ms`);
      }
    }
    
    const startTime = performance.now();
    
    try {
      const result = await requestFn();
      const duration = performance.now() - startTime;
      
      this.recordAPICall(limiterName, duration, true);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordAPICall(limiterName, duration, false);
      throw error;
    }
  }

  /**
   * Cached API request with automatic rate limiting
   */
  async cachedRequest(key, requestFn, options = {}) {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    
    // Determine rate limiter
    const limiterName = options.rateLimiter || 'general';
    
    // Make rate-limited request
    const result = await this.rateLimitedRequest(limiterName, requestFn, options);
    
    // Cache the result
    this.cache.set(key, result, {
      ttl: options.cacheTTL,
      priority: options.priority,
      prefetchable: options.prefetchable,
      prefetchFn: options.prefetchFn
    });
    
    return result;
  }

  /**
   * Batch processing with rate limiting
   */
  async batchProcess(items, processFn, options = {}) {
    const batchSize = options.batchSize || 10;
    const concurrency = options.concurrency || 3;
    const delay = options.delay || 100;
    const limiterName = options.rateLimiter || 'general';
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = [];
      
      for (let j = 0; j < batch.length && j < concurrency; j++) {
        const item = batch[j];
        const promise = this.rateLimitedRequest(
          limiterName,
          () => processFn(item),
          options
        ).then(result => {
          results.push({ item, result, index: i + j });
        }).catch(error => {
          errors.push({ item, error, index: i + j });
        });
        
        batchPromises.push(promise);
      }
      
      await Promise.all(batchPromises);
      
      // Add delay between batches
      if (i + batchSize < items.length) {
        await this.sleep(delay);
      }
    }
    
    return { results, errors };
  }

  /**
   * Memory optimization
   */
  async optimizeMemory() {
    const stats = this.cache.getStats();
    
    if (performance.memory && 
        performance.memory.usedJSHeapSize > this.config.performance.memoryThreshold) {
      
      // Clear expired entries
      this.clearExpiredCache();
      
      // Evict low-priority items
      this.evictLowPriorityItems();
      
      // Trigger garbage collection if available
      if (window.gc) {
        window.gc();
      }
      
      console.log('Memory optimization completed', {
        before: stats,
        after: this.cache.getStats()
      });
    }
  }

  /**
   * Service Worker initialization for offline caching
   */
  initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('ServiceWorker registered:', registration);
          
          // Setup communication with SW
          navigator.serviceWorker.addEventListener('message', (event) => {
            this.handleServiceWorkerMessage(event.data);
          });
        })
        .catch((error) => {
          console.log('ServiceWorker registration failed:', error);
        });
    }
  }

  /**
   * Prefetch data if cache entry is about to expire
   */
  async prefetchIfNeeded(key, prefetchFn) {
    const entry = this.cacheStorage.get(key);
    
    if (entry && entry.prefetchable) {
      const timeToExpiry = entry.expiresAt - Date.now();
      const ttl = entry.expiresAt - entry.createdAt;
      
      if (timeToExpiry < ttl * (1 - this.config.cache.prefetchThreshold)) {
        try {
          const newValue = await prefetchFn();
          this.cache.set(key, newValue, {
            ttl: ttl,
            priority: entry.priority,
            prefetchable: true,
            prefetchFn
          });
        } catch (error) {
          console.warn('Prefetch failed for key:', key, error);
        }
      }
    }
  }

  /**
   * Utility methods
   */
  evictLRUItems() {
    const entries = Array.from(this.cacheStorage.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toEvict = Math.ceil(this.config.cache.maxSize * 0.1); // Evict 10%
    for (let i = 0; i < toEvict; i++) {
      this.cacheStorage.delete(entries[i][0]);
    }
  }

  evictLowPriorityItems() {
    const entries = Array.from(this.cacheStorage.entries());
    entries.sort((a, b) => a[1].priority - b[1].priority);
    
    const toEvict = Math.ceil(entries.length * 0.2); // Evict 20% of low priority
    for (let i = 0; i < toEvict; i++) {
      if (entries[i][1].priority < 5) { // Only evict priority < 5
        this.cacheStorage.delete(entries[i][0]);
      }
    }
  }

  clearExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cacheStorage.entries()) {
      if (now > entry.expiresAt) {
        this.cacheStorage.delete(key);
      }
    }
  }

  calculateObjectSize(obj) {
    return JSON.stringify(obj).length * 2; // Rough estimate
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  recordAPICall(service, duration, success) {
    this.performanceMetrics.apiCalls++;
    
    // Update average response time
    this.performanceMetrics.averageResponseTime = 
      (this.performanceMetrics.averageResponseTime + duration) / 2;
    
    // Update error rate
    if (!success) {
      this.performanceMetrics.errorRate = 
        (this.performanceMetrics.errorRate + 1) / this.performanceMetrics.apiCalls;
    }
    
    // Log slow requests
    if (duration > this.config.performance.slowRequestThreshold) {
      console.warn(`Slow API call detected: ${service} took ${duration}ms`);
    }
  }

  recordPerformanceMetric(entry) {
    console.log('Performance metric:', entry.name, entry.duration);
  }

  checkMemoryUsage() {
    if (performance.memory) {
      const usage = performance.memory.usedJSHeapSize;
      if (usage > this.config.performance.memoryThreshold) {
        this.optimizeMemory();
      }
    }
  }

  handleServiceWorkerMessage(data) {
    switch (data.type) {
      case 'CACHE_UPDATED':
        console.log('Service worker cache updated:', data.cacheName);
        break;
      case 'OFFLINE_FALLBACK':
        console.log('Offline fallback activated');
        break;
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      cache: this.cache.getStats(),
      rateLimiters: Object.fromEntries(
        Array.from(this.rateLimiters.entries()).map(([name, limiter]) => [
          name,
          limiter.getStatus()
        ])
      ),
      memory: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null
    };
  }

  /**
   * Performance optimization recommendations
   */
  getOptimizationRecommendations() {
    const stats = this.getPerformanceStats();
    const recommendations = [];
    
    // Cache hit rate
    if (stats.cache.hitRate < 0.7) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        message: 'Cache hit rate is low. Consider increasing cache TTL or prefetching more data.'
      });
    }
    
    // Memory usage
    if (stats.memory && stats.memory.used / stats.memory.limit > 0.8) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: 'Memory usage is high. Consider clearing cache or optimizing data structures.'
      });
    }
    
    // Response time
    if (stats.averageResponseTime > this.config.performance.slowRequestThreshold) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Average response time is slow. Consider caching more aggressively or optimizing API calls.'
      });
    }
    
    // Error rate
    if (stats.errorRate > 0.05) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'High error rate detected. Check API endpoints and network connectivity.'
      });
    }
    
    return recommendations;
  }
}

// Initialize performance manager
let performanceManager;

// Check if we're in a browser environment
if (typeof window !== 'undefined') {
  performanceManager = new PerformanceManager();

  // Setup default rate limiters
  performanceManager.createRateLimiter('spotify', performanceManager.config.rateLimit.spotifyAPI);
  performanceManager.createRateLimiter('openai', performanceManager.config.rateLimit.openAI);
}

// Browser-compatible exports
if (typeof window !== 'undefined') {
  window.PerformanceManager = PerformanceManager;
  window.performanceManager = performanceManager;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PerformanceManager,
    performanceManager
  };
}