// Performance Testing Scenarios for EchoTune AI
// Tests system performance under various load conditions

const { EnhancedFileMCP } = require('../../mcp-servers/enhanced-file-utilities');
const { ComprehensiveValidator } = require('../../mcp-servers/comprehensive-validator');

describe('Performance Testing Scenarios', () => {
  let fileMCP;
  let validator;

  beforeAll(() => {
    fileMCP = new EnhancedFileMCP();
    validator = new ComprehensiveValidator();
  });

  describe('File Operations Performance', () => {
    test('should handle rapid file reads', async () => {
      const iterations = 50;
      const startTime = Date.now();
      
      const operations = Array(iterations).fill().map(() => 
        fileMCP.readFile('package.json')
      );
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      
      // All operations should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Performance benchmarks
      const totalTime = endTime - startTime;
      const avgTimePerOperation = totalTime / iterations;
      
      console.log(`📊 File Read Performance:
        • Total operations: ${iterations}
        • Total time: ${totalTime}ms
        • Average per operation: ${avgTimePerOperation.toFixed(2)}ms
        • Operations per second: ${(1000 / avgTimePerOperation).toFixed(2)}`);
      
      // Should complete within reasonable time
      expect(avgTimePerOperation).toBeLessThan(50); // Less than 50ms per operation
      expect(totalTime).toBeLessThan(5000); // Total under 5 seconds
    });

    test('should maintain performance with directory listings', async () => {
      const iterations = 20;
      const startTime = Date.now();
      
      const operations = Array(iterations).fill().map(() => 
        fileMCP.listDirectory('src')
      );
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      
      expect(results.every(r => r.success)).toBe(true);
      
      const totalTime = endTime - startTime;
      const avgTimePerOperation = totalTime / iterations;
      
      console.log(`📊 Directory Listing Performance:
        • Total operations: ${iterations}
        • Total time: ${totalTime}ms
        • Average per operation: ${avgTimePerOperation.toFixed(2)}ms`);
      
      expect(avgTimePerOperation).toBeLessThan(100);
    });

    test('should handle large batch operations efficiently', async () => {
      const batchSize = 10;
      const operations = [];
      
      // Create mixed batch operations
      for (let i = 0; i < batchSize; i++) {
        operations.push({
          type: i % 2 === 0 ? 'read' : 'list',
          path: i % 2 === 0 ? 'package.json' : 'src'
        });
      }
      
      const startTime = Date.now();
      const result = await fileMCP.batchOperations(operations);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(batchSize);
      
      const totalTime = endTime - startTime;
      console.log(`📊 Batch Operations Performance:
        • Batch size: ${batchSize}
        • Total time: ${totalTime}ms
        • Time per operation: ${(totalTime / batchSize).toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Validation Performance', () => {
    test('should complete system validation quickly', async () => {
      const iterations = 5;
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await validator.validateSystem();
        const endTime = Date.now();
        
        times.push(endTime - startTime);
        expect(result.overallStatus).toBeDefined();
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      console.log(`📊 System Validation Performance:
        • Iterations: ${iterations}
        • Average time: ${avgTime.toFixed(2)}ms
        • Min time: ${minTime}ms
        • Max time: ${maxTime}ms`);
      
      expect(avgTime).toBeLessThan(500); // Should average under 500ms
      expect(maxTime).toBeLessThan(1000); // No single validation over 1 second
    });

    test('should handle concurrent validations', async () => {
      const concurrentCount = 3;
      const startTime = Date.now();
      
      const operations = Array(concurrentCount).fill().map(() => 
        validator.validateSystem()
      );
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      
      expect(results.every(r => r.overallStatus)).toBe(true);
      
      const totalTime = endTime - startTime;
      console.log(`📊 Concurrent Validation Performance:
        • Concurrent operations: ${concurrentCount}
        • Total time: ${totalTime}ms
        • Time per validation: ${(totalTime / concurrentCount).toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(2000);
    });
  });

  describe('Memory Usage Performance', () => {
    test('should not leak memory during operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await fileMCP.readFile('package.json');
        
        // Trigger garbage collection periodically
        if (i % 25 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory increase should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      console.log(`📊 Memory Usage:
        • Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        • Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        • Increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Memory increase should be minimal (less than 10MB for 100 operations)
      expect(memoryIncreaseMB).toBeLessThan(10);
    });

    test('should clean up audit logs appropriately', async () => {
      // Fill up the audit log
      for (let i = 0; i < 1200; i++) {
        await fileMCP.readFile('package.json');
      }
      
      const auditTrail = fileMCP.getAuditTrail(2000);
      
      // Should be limited to max size
      expect(auditTrail.length).toBeLessThanOrEqual(1000);
      
      console.log(`📊 Audit Log Management:
        • Operations performed: 1200
        • Audit entries kept: ${auditTrail.length}
        • Memory efficiency: ✅`);
    });
  });

  describe('Stress Testing', () => {
    test('should handle mixed workload stress test', async () => {
      const testDuration = 5000; // 5 seconds
      const startTime = Date.now();
      let operationCount = 0;
      let errorCount = 0;
      
      const operations = [];
      
      // Run operations for specified duration
      while (Date.now() - startTime < testDuration) {
        const operation = Math.random() < 0.7 
          ? fileMCP.readFile('package.json')
          : fileMCP.listDirectory('src');
        
        operations.push(
          operation
            .then(() => operationCount++)
            .catch(() => errorCount++)
        );
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Wait for all operations to complete
      await Promise.all(operations);
      
      const actualDuration = Date.now() - startTime;
      const operationsPerSecond = (operationCount / actualDuration) * 1000;
      const errorRate = errorCount / (operationCount + errorCount);
      
      console.log(`📊 Stress Test Results:
        • Duration: ${actualDuration}ms
        • Total operations: ${operationCount}
        • Errors: ${errorCount}
        • Operations/sec: ${operationsPerSecond.toFixed(2)}
        • Error rate: ${(errorRate * 100).toFixed(2)}%`);
      
      expect(operationCount).toBeGreaterThan(10); // Should complete some operations
      expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate
    });

    test('should recover from error conditions', async () => {
      let successCount = 0;
      let errorCount = 0;
      
      // Mix of valid and invalid operations
      const operations = [
        // Valid operations
        ...Array(10).fill().map(() => 
          fileMCP.readFile('package.json')
            .then(() => successCount++)
            .catch(() => errorCount++)
        ),
        // Invalid operations (should fail gracefully)
        ...Array(5).fill().map(() => 
          fileMCP.readFile('non-existent-file.txt')
            .then(() => successCount++)
            .catch(() => errorCount++)
        )
      ];
      
      await Promise.all(operations);
      
      console.log(`📊 Error Recovery Test:
        • Successful operations: ${successCount}
        • Expected errors: ${errorCount}
        • System stability: ✅`);
      
      expect(successCount).toBe(10); // All valid operations should succeed
      expect(errorCount).toBe(5); // All invalid operations should fail gracefully
      
      // System should still be functional after errors
      const health = await fileMCP.healthCheck();
      expect(health.status).toBe('healthy');
    });
  });

  describe('Performance Monitoring', () => {
    test('should provide detailed performance analytics', async () => {
      // Perform various operations to generate metrics
      await fileMCP.readFile('package.json');
      await fileMCP.listDirectory('src');
      await fileMCP.validateFile('package.json');
      
      const analytics = fileMCP.getPerformanceAnalytics();
      
      expect(analytics).toBeInstanceOf(Object);
      
      // Should have metrics for different operation types
      if (analytics.read) {
        expect(analytics.read.averageMs).toBeGreaterThan(0);
        expect(analytics.read.count).toBeGreaterThan(0);
        expect(analytics.read.minMs).toBeGreaterThanOrEqual(0);
        expect(analytics.read.maxMs).toBeGreaterThanOrEqual(analytics.read.minMs);
      }
      
      console.log('📊 Performance Analytics:', JSON.stringify(analytics, null, 2));
    });

    test('should track performance trends', async () => {
      const initialAnalytics = fileMCP.getPerformanceAnalytics();
      
      // Perform more operations
      for (let i = 0; i < 10; i++) {
        await fileMCP.readFile('package.json');
      }
      
      const updatedAnalytics = fileMCP.getPerformanceAnalytics();
      
      // Should have updated metrics
      if (initialAnalytics.read && updatedAnalytics.read) {
        expect(updatedAnalytics.read.count).toBeGreaterThan(initialAnalytics.read.count);
      }
    });
  });

  describe('Benchmarking', () => {
    test('should establish performance baselines', async () => {
      const benchmarks = {
        fileRead: { target: 10, unit: 'ms' },
        directoryList: { target: 50, unit: 'ms' },
        systemValidation: { target: 200, unit: 'ms' },
        batchOperations: { target: 100, unit: 'ms' }
      };
      
      const results = {};
      
      // File read benchmark
      const fileReadStart = Date.now();
      await fileMCP.readFile('package.json');
      results.fileRead = Date.now() - fileReadStart;
      
      // Directory list benchmark
      const dirListStart = Date.now();
      await fileMCP.listDirectory('src');
      results.directoryList = Date.now() - dirListStart;
      
      // System validation benchmark
      const validationStart = Date.now();
      await validator.validateSystem();
      results.systemValidation = Date.now() - validationStart;
      
      // Batch operations benchmark
      const batchStart = Date.now();
      await fileMCP.batchOperations([
        { type: 'read', path: 'package.json' },
        { type: 'list', path: 'src' }
      ]);
      results.batchOperations = Date.now() - batchStart;
      
      console.log('📊 Performance Benchmarks:');
      Object.entries(results).forEach(([operation, time]) => {
        const benchmark = benchmarks[operation];
        const status = time <= benchmark.target ? '✅' : '⚠️';
        console.log(`  ${status} ${operation}: ${time}ms (target: ${benchmark.target}ms)`);
      });
      
      // Performance assertions (lenient for CI environment)
      expect(results.fileRead).toBeLessThan(100);
      expect(results.directoryList).toBeLessThan(200);
      expect(results.systemValidation).toBeLessThan(1000);
      expect(results.batchOperations).toBeLessThan(500);
    });
  });
});