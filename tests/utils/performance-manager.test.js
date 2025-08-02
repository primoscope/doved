/**
 * Comprehensive tests for Performance Manager
 */

const { PerformanceManager } = require('../../src/utils/performance-manager');

describe('PerformanceManager', () => {
  let performanceManager;
  let mockPerformance;
  let mockWindow;

  beforeEach(() => {
    mockPerformance = {
      now: jest.fn(() => Date.now()),
      memory: {
        usedJSHeapSize: 10 * 1024 * 1024, // 10MB
        totalJSHeapSize: 50 * 1024 * 1024, // 50MB
        jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB
      }
    };

    mockWindow = {
      crypto: {
        getRandomValues: jest.fn(() => new Uint8Array(32).fill(1))
      }
    };

    global.performance = mockPerformance;
    global.window = mockWindow;
    
    performanceManager = new PerformanceManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache Management', () => {
    test('should set and get cache values', () => {
      const key = 'test_key';
      const value = { data: 'test_data' };
      
      performanceManager.cache.set(key, value);
      const retrieved = performanceManager.cache.get(key);
      
      expect(retrieved).toEqual(value);
    });

    test('should return null for non-existent keys', () => {
      const result = performanceManager.cache.get('non_existent_key');
      expect(result).toBeNull();
    });

    test('should respect TTL and expire cache entries', () => {
      const key = 'expiring_key';
      const value = { data: 'test' };
      const shortTTL = 100; // 100ms
      
      performanceManager.cache.set(key, value, { ttl: shortTTL });
      
      // Should be available immediately
      expect(performanceManager.cache.get(key)).toEqual(value);
      
      // Mock time advancement
      Date.now = jest.fn(() => Date.now() + shortTTL + 1);
      
      // Should be expired
      expect(performanceManager.cache.get(key)).toBeNull();
    });

    test('should evict LRU items when cache is full', () => {
      // Set cache size to 2 for testing
      performanceManager.config.cache.maxSize = 2;
      
      performanceManager.cache.set('key1', 'value1');
      performanceManager.cache.set('key2', 'value2');
      performanceManager.cache.set('key3', 'value3'); // Should evict key1
      
      expect(performanceManager.cache.get('key1')).toBeNull();
      expect(performanceManager.cache.get('key2')).toEqual('value2');
      expect(performanceManager.cache.get('key3')).toEqual('value3');
    });

    test('should update cache statistics correctly', () => {
      performanceManager.cache.set('key1', 'value1');
      performanceManager.cache.get('key1'); // hit
      performanceManager.cache.get('nonexistent'); // miss
      
      const stats = performanceManager.cache.getStats();
      
      expect(stats.entries).toBe(1);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    test('should check cache existence correctly', () => {
      const key = 'test_key';
      
      expect(performanceManager.cache.has(key)).toBe(false);
      
      performanceManager.cache.set(key, 'value');
      expect(performanceManager.cache.has(key)).toBe(true);
    });

    test('should clear cache correctly', () => {
      performanceManager.cache.set('key1', 'value1');
      performanceManager.cache.set('key2', 'value2');
      
      expect(performanceManager.cache.has('key1')).toBe(true);
      expect(performanceManager.cache.has('key2')).toBe(true);
      
      performanceManager.cache.clear();
      
      expect(performanceManager.cache.has('key1')).toBe(false);
      expect(performanceManager.cache.has('key2')).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    test('should create rate limiter with correct configuration', () => {
      const limiter = performanceManager.createRateLimiter('test', {
        requests: 10,
        window: 60000
      });
      
      expect(limiter).toBeDefined();
      expect(limiter.isAllowed).toBeInstanceOf(Function);
      expect(limiter.getStatus).toBeInstanceOf(Function);
    });

    test('should allow requests within rate limit', () => {
      const limiter = performanceManager.createRateLimiter('test', {
        requests: 2,
        window: 60000
      });
      
      const result1 = limiter.isAllowed();
      const result2 = limiter.isAllowed();
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    test('should block requests exceeding rate limit', () => {
      const limiter = performanceManager.createRateLimiter('test', {
        requests: 1,
        window: 60000
      });
      
      const result1 = limiter.isAllowed();
      const result2 = limiter.isAllowed();
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
      expect(result2.retryAfter).toBeGreaterThan(0);
    });

    test('should provide correct status information', () => {
      const limiter = performanceManager.createRateLimiter('test', {
        requests: 5,
        window: 60000
      });
      
      limiter.isAllowed();
      limiter.isAllowed();
      
      const status = limiter.getStatus();
      
      expect(status.remaining).toBe(3);
      expect(status.total).toBe(5);
    });
  });

  describe('Rate Limited Requests', () => {
    test('should execute request when rate limit allows', async () => {
      const mockRequestFn = jest.fn().mockResolvedValue('success');
      
      performanceManager.createRateLimiter('test', {
        requests: 10,
        window: 60000
      });
      
      const result = await performanceManager.rateLimitedRequest('test', mockRequestFn);
      
      expect(result).toBe('success');
      expect(mockRequestFn).toHaveBeenCalledTimes(1);
    });

    test('should throw error when rate limit exceeded', async () => {
      const mockRequestFn = jest.fn().mockResolvedValue('success');
      
      const limiter = performanceManager.createRateLimiter('test', {
        requests: 1,
        window: 60000
      });
      
      // Use up the rate limit
      limiter.isAllowed();
      
      await expect(
        performanceManager.rateLimitedRequest('test', mockRequestFn)
      ).rejects.toThrow('Rate limit exceeded');
    });

    test('should record API call metrics', async () => {
      const mockRequestFn = jest.fn().mockResolvedValue('success');
      
      performanceManager.createRateLimiter('test', {
        requests: 10,
        window: 60000
      });
      
      const initialCalls = performanceManager.performanceMetrics.apiCalls;
      
      await performanceManager.rateLimitedRequest('test', mockRequestFn);
      
      expect(performanceManager.performanceMetrics.apiCalls).toBe(initialCalls + 1);
    });
  });

  describe('Cached Requests', () => {
    test('should return cached result on subsequent calls', async () => {
      const mockRequestFn = jest.fn().mockResolvedValue('api_result');
      
      const result1 = await performanceManager.cachedRequest('cache_key', mockRequestFn);
      const result2 = await performanceManager.cachedRequest('cache_key', mockRequestFn);
      
      expect(result1).toBe('api_result');
      expect(result2).toBe('api_result');
      expect(mockRequestFn).toHaveBeenCalledTimes(1); // Only called once
    });

    test('should make API call if cache miss', async () => {
      const mockRequestFn = jest.fn().mockResolvedValue('api_result');
      
      const result = await performanceManager.cachedRequest('new_key', mockRequestFn);
      
      expect(result).toBe('api_result');
      expect(mockRequestFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Batch Processing', () => {
    test('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const processFn = jest.fn().mockImplementation(async (item) => item * 2);
      
      const { results } = await performanceManager.batchProcess(items, processFn, {
        batchSize: 2,
        concurrency: 1,
        delay: 10
      });
      
      expect(results).toHaveLength(5);
      expect(processFn).toHaveBeenCalledTimes(5);
    });

    test('should handle errors in batch processing', async () => {
      const items = [1, 2, 3];
      const processFn = jest.fn().mockImplementation(async (item) => {
        if (item === 2) throw new Error('Processing failed');
        return item * 2;
      });
      
      const { results, errors } = await performanceManager.batchProcess(items, processFn, {
        batchSize: 1,
        concurrency: 1
      });
      
      expect(results).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0].item).toBe(2);
    });
  });

  describe('Memory Optimization', () => {
    test('should optimize memory when threshold exceeded', async () => {
      // Mock high memory usage
      mockPerformance.memory.usedJSHeapSize = 80 * 1024 * 1024; // 80MB
      
      const clearExpiredSpy = jest.spyOn(performanceManager, 'clearExpiredCache');
      const evictLowPrioritySpy = jest.spyOn(performanceManager, 'evictLowPriorityItems');
      
      await performanceManager.optimizeMemory();
      
      expect(clearExpiredSpy).toHaveBeenCalled();
      expect(evictLowPrioritySpy).toHaveBeenCalled();
    });

    test('should not optimize memory when under threshold', async () => {
      // Mock low memory usage
      mockPerformance.memory.usedJSHeapSize = 10 * 1024 * 1024; // 10MB
      
      const clearExpiredSpy = jest.spyOn(performanceManager, 'clearExpiredCache');
      
      await performanceManager.optimizeMemory();
      
      expect(clearExpiredSpy).not.toHaveBeenCalled();
    });
  });

  describe('Performance Statistics', () => {
    test('should return comprehensive performance stats', () => {
      // Add some cache entries
      performanceManager.cache.set('key1', 'value1');
      performanceManager.cache.set('key2', 'value2');
      
      // Create a rate limiter
      performanceManager.createRateLimiter('test', { requests: 10, window: 60000 });
      
      const stats = performanceManager.getPerformanceStats();
      
      expect(stats).toHaveProperty('apiCalls');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('rateLimiters');
      expect(stats).toHaveProperty('memory');
      
      expect(stats.cache.entries).toBe(2);
      expect(stats.rateLimiters).toHaveProperty('test');
    });

    test('should provide optimization recommendations', () => {
      // Set up conditions for recommendations
      performanceManager.performanceMetrics.cacheHits = 1;
      performanceManager.performanceMetrics.cacheMisses = 10; // Low hit rate
      performanceManager.performanceMetrics.averageResponseTime = 3000; // Slow
      performanceManager.performanceMetrics.errorRate = 0.1; // High error rate
      
      const recommendations = performanceManager.getOptimizationRecommendations();
      
      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
      
      const types = recommendations.map(r => r.type);
      expect(types).toContain('cache');
      expect(types).toContain('performance');
      expect(types).toContain('reliability');
    });
  });

  describe('Utility Methods', () => {
    test('should calculate object size correctly', () => {
      const smallObject = { key: 'value' };
      const largeObject = { 
        key1: 'very long string value that takes more space',
        key2: [1, 2, 3, 4, 5],
        key3: { nested: 'object' }
      };
      
      const smallSize = performanceManager.calculateObjectSize(smallObject);
      const largeSize = performanceManager.calculateObjectSize(largeObject);
      
      expect(largeSize).toBeGreaterThan(smallSize);
    });

    test('should implement sleep function correctly', async () => {
      const start = Date.now();
      await performanceManager.sleep(100);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(100);
    });

    test('should evict expired cache entries', () => {
      const now = Date.now();
      
      // Add expired entry
      performanceManager.cacheStorage.set('expired', {
        value: 'old_value',
        expiresAt: now - 1000 // Expired 1 second ago
      });
      
      // Add valid entry
      performanceManager.cacheStorage.set('valid', {
        value: 'current_value',
        expiresAt: now + 60000 // Expires in 1 minute
      });
      
      performanceManager.clearExpiredCache();
      
      expect(performanceManager.cacheStorage.has('expired')).toBe(false);
      expect(performanceManager.cacheStorage.has('valid')).toBe(true);
    });
  });
});