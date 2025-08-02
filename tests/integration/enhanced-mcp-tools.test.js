// Enhanced MCP Tool Integration Tests
// Validates all new MCP tools and their integration

const { EnhancedFileMCP } = require('../../mcp-servers/enhanced-file-utilities');
const { ComprehensiveValidator } = require('../../mcp-servers/comprehensive-validator');
const fs = require('fs').promises;
const path = require('path');

describe('Enhanced MCP Tools Integration', () => {
  let fileMCP;
  let validator;

  beforeAll(async () => {
    fileMCP = new EnhancedFileMCP();
    validator = new ComprehensiveValidator();
  });

  describe('Enhanced File MCP', () => {
    test('should pass health check', async () => {
      const health = await fileMCP.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.allowedDirectories).toBeGreaterThan(0);
      expect(health.allowedExtensions).toBeGreaterThan(0);
    });

    test('should read files with validation', async () => {
      const result = await fileMCP.readFile('package.json');
      expect(result.success).toBe(true);
      expect(result.content).toContain('echotune-ai');
      expect(result.metadata.size).toBeGreaterThan(0);
      expect(result.metadata.operationId).toBeDefined();
    });

    test('should validate file security', async () => {
      const result = await fileMCP.validateFile('package.json');
      expect(result.isValid).toBe(true);
      expect(result.securityIssues).toHaveLength(0);
      expect(result.size).toBeGreaterThan(0);
    });

    test('should list directories with metadata', async () => {
      const result = await fileMCP.listDirectory('src');
      expect(result.success).toBe(true);
      expect(result.items).toBeInstanceOf(Array);
      expect(result.metadata.itemCount).toBeGreaterThan(0);
    });

    test('should handle batch operations', async () => {
      const operations = [
        { type: 'read', path: 'package.json' },
        { type: 'list', path: 'src' }
      ];
      
      const result = await fileMCP.batchOperations(operations);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.batchId).toBeDefined();
    });

    test('should provide performance analytics', () => {
      const analytics = fileMCP.getPerformanceAnalytics();
      expect(analytics).toBeInstanceOf(Object);
      
      // Should have metrics from previous operations
      if (Object.keys(analytics).length > 0) {
        const firstMetric = Object.values(analytics)[0];
        expect(firstMetric.averageMs).toBeGreaterThan(0);
        expect(firstMetric.count).toBeGreaterThan(0);
      }
    });

    test('should maintain audit trail', () => {
      const auditTrail = fileMCP.getAuditTrail(10);
      expect(auditTrail).toBeInstanceOf(Array);
      expect(auditTrail.length).toBeGreaterThan(0);
      
      const lastOperation = auditTrail[0];
      expect(lastOperation.timestamp).toBeDefined();
      expect(lastOperation.operation).toBeDefined();
      expect(lastOperation.success).toBeDefined();
    });

    test('should handle errors gracefully', async () => {
      await expect(fileMCP.readFile('non-existent-file.txt'))
        .rejects.toThrow();
      
      // Error should be logged
      const auditTrail = fileMCP.getAuditTrail(1);
      expect(auditTrail[0].success).toBe(false);
    });
  });

  describe('Comprehensive Validator', () => {
    test('should perform system validation', async () => {
      const result = await validator.validateSystem();
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.results).toBeInstanceOf(Object);
      expect(result.overallStatus).toMatch(/healthy|warning|critical|error/);
    });

    test('should validate system resources', async () => {
      const systemValidation = await validator.validateSystemResources();
      expect(systemValidation.status).toMatch(/healthy|warning|unhealthy|error/);
      expect(systemValidation.metrics).toBeInstanceOf(Object);
      expect(systemValidation.metrics.memory).toBeDefined();
      expect(systemValidation.metrics.cpu).toBeDefined();
    });

    test('should validate application components', async () => {
      const appValidation = await validator.validateApplication();
      expect(appValidation.status).toMatch(/healthy|warning|unhealthy|error/);
      expect(appValidation.metrics).toBeInstanceOf(Object);
      expect(appValidation.metrics.package).toBeDefined();
    });

    test('should generate health report', async () => {
      const report = await validator.getHealthReport();
      expect(report.validation).toBeDefined();
      expect(report.history).toBeInstanceOf(Array);
      expect(report.recentErrors).toBeInstanceOf(Array);
    });

    test('should provide recommendations', async () => {
      const result = await validator.validateSystem();
      if (result.recommendations) {
        expect(result.recommendations).toBeInstanceOf(Array);
        
        if (result.recommendations.length > 0) {
          const recommendation = result.recommendations[0];
          expect(recommendation.type).toBeDefined();
          expect(recommendation.priority).toBeDefined();
          expect(recommendation.action).toBeDefined();
        }
      }
    });
  });

  describe('MCP Integration Scenarios', () => {
    test('should perform end-to-end validation workflow', async () => {
      // 1. System validation
      const systemCheck = await validator.validateSystem();
      expect(systemCheck.overallStatus).toBeDefined();

      // 2. File operations based on system health
      if (systemCheck.overallStatus !== 'error') {
        const fileRead = await fileMCP.readFile('package.json');
        expect(fileRead.success).toBe(true);

        const fileValidation = await fileMCP.validateFile('package.json');
        expect(fileValidation.isValid).toBe(true);
      }
    });

    test('should handle error recovery scenarios', async () => {
      // Simulate error condition
      try {
        await fileMCP.readFile('invalid-path/non-existent.txt');
        fail('Expected error was not thrown');
      } catch (error) {
        // Should handle any file system error gracefully
        expect(error.message).toMatch(/ENOENT|Security violation|no such file/);
      }

      // Verify error was logged and system continues to function
      const auditTrail = fileMCP.getAuditTrail(1);
      expect(auditTrail[0].success).toBe(false);

      // System should still be functional
      const health = await fileMCP.healthCheck();
      expect(health.status).toBe('healthy');
    });

    test('should maintain performance under load', async () => {
      const operations = [];
      
      // Create multiple concurrent operations
      for (let i = 0; i < 5; i++) {
        operations.push(fileMCP.readFile('package.json'));
      }

      const results = await Promise.all(operations);
      
      // All operations should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Performance metrics should be reasonable
      const analytics = fileMCP.getPerformanceAnalytics();
      if (analytics.read) {
        expect(analytics.read.averageMs).toBeLessThan(1000); // Should be fast
      }
    });
  });

  describe('Integration with Existing Systems', () => {
    test('should integrate with package.json scripts', async () => {
      const packageContent = await fileMCP.readFile('package.json');
      const packageData = JSON.parse(packageContent.content);
      
      // Check for MCP-related scripts
      expect(packageData.scripts['mcp-health']).toBeDefined();
      expect(packageData.scripts['mcp-install']).toBeDefined();
      expect(packageData.scripts['workflow:analyze']).toBeDefined();
    });

    test('should validate MCP server configuration', async () => {
      const packageContent = await fileMCP.readFile('package.json');
      const packageData = JSON.parse(packageContent.content);
      
      expect(packageData.mcp).toBeDefined();
      expect(packageData.mcp.servers).toBeDefined();
      
      // Check for enhanced MCP tools
      expect(packageData.mcp.servers['enhanced-file-utilities']).toBeDefined();
      expect(packageData.mcp.servers['comprehensive-validator']).toBeDefined();
    });

    test('should work with existing test infrastructure', () => {
      // This test itself proves integration with Jest
      expect(process.env.NODE_ENV).toBeDefined();
    });
  });

  describe('Security and Validation', () => {
    test('should enforce security policies', async () => {
      // Test path traversal protection
      await expect(fileMCP.readFile('../../../etc/passwd'))
        .rejects.toThrow('Security violation');

      // Test extension validation
      const result = await fileMCP.validateFile('package.json');
      expect(result.securityIssues).toHaveLength(0);
    });

    test('should detect security issues in system', async () => {
      const securityValidation = await validator.validateSecurity();
      expect(securityValidation.status).toMatch(/healthy|warning|critical|error/);
      expect(securityValidation.metrics).toBeDefined();
    });

    test('should validate file permissions', async () => {
      const systemValidation = await validator.validateSystem();
      const securityResults = systemValidation.results.security;
      
      expect(securityResults).toBeDefined();
      expect(securityResults.metrics).toBeDefined();
    });
  });

  describe('Performance Testing', () => {
    test('should complete file operations within time limits', async () => {
      const startTime = Date.now();
      
      await fileMCP.readFile('package.json');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast for small files
    });

    test('should handle concurrent operations efficiently', async () => {
      const startTime = Date.now();
      
      const operations = Array(10).fill().map(() => 
        fileMCP.readFile('package.json')
      );
      
      await Promise.all(operations);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // All operations should complete quickly
    });

    test('should provide performance metrics', () => {
      const analytics = fileMCP.getPerformanceAnalytics();
      
      if (Object.keys(analytics).length > 0) {
        const readMetrics = analytics.read;
        if (readMetrics) {
          expect(readMetrics.averageMs).toBeGreaterThan(0);
          expect(readMetrics.minMs).toBeGreaterThanOrEqual(0);
          expect(readMetrics.maxMs).toBeGreaterThanOrEqual(readMetrics.minMs);
          expect(readMetrics.count).toBeGreaterThan(0);
        }
      }
    });
  });
});