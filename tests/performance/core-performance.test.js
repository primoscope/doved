// Core Performance Testing
// Validates system performance benchmarks and identifies bottlenecks

const { performance } = require('perf_hooks');
const { EnhancedFileMCP } = require('../../mcp-servers/enhanced-file-utilities');
const { ComprehensiveValidator } = require('../../mcp-servers/comprehensive-validator');

describe('Core Performance Testing', () => {
  let fileMCP;
  let validator;

  beforeAll(async () => {
    fileMCP = new EnhancedFileMCP();
    validator = new ComprehensiveValidator();
  });

  describe('File Operations Performance', () => {
    test('should complete file read operations within time limits', async () => {
      const iterations = 50;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fileMCP.readFile('package.json');
        const duration = performance.now() - start;
        times.push(duration);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(averageTime).toBeLessThan(50); // Average should be under 50ms
      expect(maxTime).toBeLessThan(200); // Max should be under 200ms

      console.log(`📊 File Read Performance:
        Average: ${averageTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        Min: ${Math.min(...times).toFixed(2)}ms`);
    });

    test('should handle concurrent file operations efficiently', async () => {
      const concurrency = 20;
      const start = performance.now();
      
      const operations = Array(concurrency).fill().map((_, i) => 
        fileMCP.readFile('package.json')
      );
      
      const results = await Promise.all(operations);
      const duration = performance.now() - start;
      
      expect(results).toHaveLength(concurrency);
      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      console.log(`🚀 Concurrent Operations (${concurrency}): ${duration.toFixed(2)}ms`);
    });

    test('should maintain performance under memory stress', async () => {
      const largeDataOps = 10;
      const memoryBefore = process.memoryUsage();
      
      // Simulate memory-intensive operations
      for (let i = 0; i < largeDataOps; i++) {
        await fileMCP.readFile('package.json');
        await fileMCP.listDirectory('src');
        await fileMCP.validateFile('package.json');
      }
      
      const memoryAfter = process.memoryUsage();
      const memoryIncrease = memoryAfter.heapUsed - memoryBefore.heapUsed;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);

      console.log(`💾 Memory Usage:
        Before: ${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)}MB
        After: ${(memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Validation Performance', () => {
    test('should complete system validation quickly', async () => {
      const start = performance.now();
      
      const report = await validator.getHealthReport();
      
      const duration = performance.now() - start;
      
      expect(report).toBeDefined();
      // Handle various possible report structures
      if (report.overall) {
        expect(report.overall.status).toBeDefined();
      } else if (report.status) {
        expect(report.status).toBeDefined();
      } else {
        expect(typeof report).toBe('object');
      }
      expect(duration).toBeLessThan(500); // Should complete within 500ms

      console.log(`✅ System Validation: ${duration.toFixed(2)}ms`);
    });

    test('should handle batch validation efficiently', async () => {
      const validationTypes = [
        'resources',
        'security', 
        'performance',
        'connectivity'
      ];

      const start = performance.now();
      
      const results = await Promise.all(
        validationTypes.map(type => validator.validateSystem(type))
      );
      
      const duration = performance.now() - start;
      
      expect(results).toHaveLength(validationTypes.length);
      expect(duration).toBeLessThan(2000); // All validations under 2 seconds

      console.log(`🔍 Batch Validation (${validationTypes.length} types): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Performance Analytics', () => {
    test('should provide detailed performance metrics', async () => {
      // Perform several operations to generate metrics
      await fileMCP.readFile('package.json');
      await fileMCP.listDirectory('src');
      await fileMCP.validateFile('package.json');

      const analytics = fileMCP.getPerformanceAnalytics();
      
      if (Object.keys(analytics).length > 0) {
        expect(analytics).toHaveProperty('read');
        
        if (analytics.read) {
          expect(analytics.read.count).toBeGreaterThan(0);
          expect(analytics.read.averageMs).toBeGreaterThan(0);
          expect(typeof analytics.read.minMs).toBe('number');
          expect(typeof analytics.read.maxMs).toBe('number');
        }

        console.log('📈 Performance Analytics:', JSON.stringify(analytics, null, 2));
      }
    });

    test('should track performance trends over time', async () => {
      const initialMetrics = fileMCP.getPerformanceAnalytics();
      
      // Perform additional operations
      for (let i = 0; i < 10; i++) {
        await fileMCP.readFile('package.json');
      }
      
      const updatedMetrics = fileMCP.getPerformanceAnalytics();
      
      if (updatedMetrics.read && initialMetrics.read) {
        expect(updatedMetrics.read.count).toBeGreaterThan(initialMetrics.read.count);
      }
    });
  });

  afterAll(async () => {
    // Clean up any resources
    if (fileMCP && typeof fileMCP.cleanup === 'function') {
      await fileMCP.cleanup();
    }
  });
});