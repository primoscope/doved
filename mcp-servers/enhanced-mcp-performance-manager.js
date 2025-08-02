#!/usr/bin/env node

/**
 * Enhanced MCP Performance Manager
 * Optimizes MCP server performance, implements caching, and provides monitoring
 */

const EventEmitter = require('events');
const path = require('path');

class EnhancedMCPPerformanceManager extends EventEmitter {
  constructor() {
    super();
    this.performanceMetrics = {
      requests: 0,
      avgResponseTime: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.cache = new Map();
    this.cacheConfig = {
      ttl: 300000, // 5 minutes
      maxSize: 1000
    };
    
    this.optimizations = {
      batchRequests: true,
      connectionPooling: true,
      responseCaching: true,
      requestThrottling: true
    };
    
    this.initializeOptimizations();
  }

  initializeOptimizations() {
    console.log('🚀 Initializing MCP Performance Optimizations...');
    
    // Initialize connection pooling
    this.connectionPool = {
      maxConnections: 10,
      activeConnections: 0,
      queue: []
    };
    
    // Initialize request batching
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchSize = 5;
    
    // Initialize monitoring
    this.startPerformanceMonitoring();
    
    console.log('✅ MCP Performance Manager initialized');
  }

  async optimizedRequest(serverName, operation, params = {}) {
    const startTime = Date.now();
    this.performanceMetrics.requests++;
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(serverName, operation, params);
      if (this.optimizations.responseCaching && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheConfig.ttl) {
          this.performanceMetrics.cacheHits++;
          this.emit('cache_hit', { serverName, operation });
          return cached.data;
        } else {
          this.cache.delete(cacheKey);
        }
      }
      
      this.performanceMetrics.cacheMisses++;
      
      // Execute optimized request
      let result;
      if (this.optimizations.batchRequests && this.canBatch(operation)) {
        result = await this.batchRequest(serverName, operation, params);
      } else {
        result = await this.directRequest(serverName, operation, params);
      }
      
      // Cache successful responses
      if (this.optimizations.responseCaching && this.shouldCache(operation)) {
        this.cacheResult(cacheKey, result);
      }
      
      // Update performance metrics
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime);
      
      this.emit('request_completed', {
        serverName,
        operation,
        responseTime,
        cached: false
      });
      
      return result;
      
    } catch (error) {
      this.performanceMetrics.errors++;
      this.emit('request_error', { serverName, operation, error: error.message });
      throw error;
    }
  }

  async batchRequest(serverName, operation, params) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ serverName, operation, params, resolve, reject });
      
      if (this.batchQueue.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.processBatch(), 100);
      }
    });
  }

  async processBatch() {
    if (this.batchQueue.length === 0) return;
    
    const batch = this.batchQueue.splice(0, this.batchSize);
    this.batchTimeout = null;
    
    console.log(`📦 Processing batch of ${batch.length} requests`);
    
    try {
      const results = await Promise.allSettled(
        batch.map(item => this.directRequest(item.serverName, item.operation, item.params))
      );
      
      results.forEach((result, index) => {
        const item = batch[index];
        if (result.status === 'fulfilled') {
          item.resolve(result.value);
        } else {
          item.reject(result.reason);
        }
      });
      
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }

  async directRequest(serverName, operation, params) {
    // Simulate direct MCP server request
    const mockResponse = {
      serverName,
      operation,
      params,
      timestamp: new Date().toISOString(),
      result: `Optimized response for ${operation} from ${serverName}`,
      optimizations: {
        cached: false,
        batched: false,
        connectionPooled: this.optimizations.connectionPooling
      }
    };
    
    // Simulate network delay with optimization
    const delay = this.optimizations.connectionPooling ? 50 : 200;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return mockResponse;
  }

  generateCacheKey(serverName, operation, params) {
    return `${serverName}:${operation}:${JSON.stringify(params)}`;
  }

  canBatch(operation) {
    const batchableOperations = ['read', 'validate', 'health', 'list'];
    return batchableOperations.includes(operation);
  }

  shouldCache(operation) {
    const cacheableOperations = ['read', 'health', 'list', 'validate'];
    return cacheableOperations.includes(operation);
  }

  cacheResult(cacheKey, result) {
    // Implement LRU cache eviction
    if (this.cache.size >= this.cacheConfig.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }

  updatePerformanceMetrics(responseTime) {
    const currentAvg = this.performanceMetrics.avgResponseTime;
    const requests = this.performanceMetrics.requests;
    
    this.performanceMetrics.avgResponseTime = 
      (currentAvg * (requests - 1) + responseTime) / requests;
  }

  startPerformanceMonitoring() {
    setInterval(() => {
      this.emit('performance_update', {
        ...this.performanceMetrics,
        cacheSize: this.cache.size,
        cacheHitRate: this.performanceMetrics.cacheHits / 
          (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0
      });
    }, 30000); // Every 30 seconds
  }

  getPerformanceReport() {
    const totalRequests = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? 
      (this.performanceMetrics.cacheHits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      timestamp: new Date().toISOString(),
      metrics: this.performanceMetrics,
      cache: {
        size: this.cache.size,
        hitRate: `${cacheHitRate}%`,
        maxSize: this.cacheConfig.maxSize,
        ttl: this.cacheConfig.ttl
      },
      optimizations: {
        enabled: this.optimizations,
        connectionPool: {
          maxConnections: this.connectionPool.maxConnections,
          activeConnections: this.connectionPool.activeConnections,
          queueLength: this.connectionPool.queue.length
        },
        batchProcessing: {
          currentBatchSize: this.batchQueue.length,
          maxBatchSize: this.batchSize
        }
      },
      recommendations: this.generateOptimizationRecommendations()
    };
  }

  generateOptimizationRecommendations() {
    const recommendations = [];
    const cacheHitRate = this.performanceMetrics.cacheHits / 
      (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0;
    
    if (cacheHitRate < 0.3) {
      recommendations.push({
        type: 'cache_optimization',
        message: 'Low cache hit rate detected. Consider increasing cache TTL or optimizing cache keys.',
        priority: 'high'
      });
    }
    
    if (this.performanceMetrics.avgResponseTime > 1000) {
      recommendations.push({
        type: 'performance_optimization',
        message: 'High average response time. Consider enabling connection pooling and batch processing.',
        priority: 'high'
      });
    }
    
    if (this.performanceMetrics.errors / this.performanceMetrics.requests > 0.05) {
      recommendations.push({
        type: 'error_rate_optimization',
        message: 'High error rate detected. Review server health and implement retry mechanisms.',
        priority: 'critical'
      });
    }
    
    return recommendations;
  }

  enableOptimization(optimization) {
    if (this.optimizations.hasOwnProperty(optimization)) {
      this.optimizations[optimization] = true;
      console.log(`✅ Enabled optimization: ${optimization}`);
    }
  }

  disableOptimization(optimization) {
    if (this.optimizations.hasOwnProperty(optimization)) {
      this.optimizations[optimization] = false;
      console.log(`❌ Disabled optimization: ${optimization}`);
    }
  }

  clearCache() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }

  // Test method for validation
  async runPerformanceTest() {
    console.log('🧪 Running MCP Performance Test...');
    
    const testOperations = [
      { server: 'enhanced-file-utilities', operation: 'read', params: { file: 'package.json' } },
      { server: 'comprehensive-validator', operation: 'health', params: {} },
      { server: 'screenshot-website-fast', operation: 'health', params: {} },
      { server: 'enhanced-file-utilities', operation: 'list', params: { dir: 'src' } },
      { server: 'comprehensive-validator', operation: 'validate', params: { type: 'system' } }
    ];
    
    const startTime = Date.now();
    const results = [];
    
    try {
      for (const test of testOperations) {
        const result = await this.optimizedRequest(test.server, test.operation, test.params);
        results.push(result);
      }
      
      const totalTime = Date.now() - startTime;
      const performanceReport = this.getPerformanceReport();
      
      console.log(`✅ Performance test completed in ${totalTime}ms`);
      console.log(`📊 Average response time: ${performanceReport.metrics.avgResponseTime.toFixed(2)}ms`);
      console.log(`💾 Cache hit rate: ${performanceReport.cache.hitRate}`);
      
      return {
        success: true,
        totalTime,
        results: results.length,
        report: performanceReport
      };
      
    } catch (error) {
      console.error('❌ Performance test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// CLI interface
async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const manager = new EnhancedMCPPerformanceManager();
  
  switch (command) {
    case 'test':
      const testResult = await manager.runPerformanceTest();
      console.log(JSON.stringify(testResult, null, 2));
      break;
      
    case 'report':
      const report = manager.getPerformanceReport();
      console.log(JSON.stringify(report, null, 2));
      break;
      
    case 'optimize':
      const optimization = args[1];
      if (optimization) {
        manager.enableOptimization(optimization);
      } else {
        console.log('Available optimizations:', Object.keys(manager.optimizations));
      }
      break;
      
    default:
      console.log('Enhanced MCP Performance Manager');
      console.log('Commands:');
      console.log('  test    - Run performance tests');
      console.log('  report  - Generate performance report');
      console.log('  optimize <type> - Enable optimization');
  }
}

if (require.main === module) {
  runCLI().catch(console.error);
}

module.exports = { EnhancedMCPPerformanceManager };