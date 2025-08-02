#!/usr/bin/env node

/**
 * Enhanced MCP Integration Test Suite
 * Tests all enhanced MCP tools and validates their functionality
 */

const { EnhancedFileMCP } = require('./enhanced-file-utilities');
const { ComprehensiveValidator } = require('./comprehensive-validator');
const fs = require('fs').promises;
const path = require('path');

class MCPIntegrationTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
  }

  async runTest(name, testFunction) {
    console.log(`🧪 Running test: ${name}`);
    const startTime = Date.now();
    
    try {
      const result = await testFunction();
      const endTime = Date.now();
      
      const testResult = {
        name,
        status: 'passed',
        duration: endTime - startTime,
        result,
        timestamp: new Date().toISOString()
      };
      
      this.results.tests.push(testResult);
      this.results.summary.passed++;
      console.log(`✅ ${name} - PASSED (${testResult.duration}ms)`);
      
      return testResult;
      
    } catch (error) {
      const endTime = Date.now();
      
      const testResult = {
        name,
        status: 'failed',
        duration: endTime - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.results.tests.push(testResult);
      this.results.summary.failed++;
      console.log(`❌ ${name} - FAILED (${testResult.duration}ms): ${error.message}`);
      
      return testResult;
    }
    
    this.results.summary.total++;
  }

  async testEnhancedFileMCP() {
    const fileMCP = new EnhancedFileMCP();
    
    // Test health check
    await this.runTest('FileMCP Health Check', async () => {
      const health = await fileMCP.healthCheck();
      if (health.status !== 'healthy') {
        throw new Error(`Health check failed: ${health.error || 'Unknown error'}`);
      }
      return health;
    });

    // Test file reading
    await this.runTest('FileMCP Read Package.json', async () => {
      const result = await fileMCP.readFile('package.json');
      if (!result.success || !result.content) {
        throw new Error('Failed to read package.json');
      }
      
      const packageData = JSON.parse(result.content);
      if (packageData.name !== 'echotune-ai') {
        throw new Error('Unexpected package name');
      }
      
      return {
        fileSize: result.metadata.size,
        packageName: packageData.name,
        version: packageData.version
      };
    });

    // Test directory listing
    await this.runTest('FileMCP List Source Directory', async () => {
      const result = await fileMCP.listDirectory('src');
      if (!result.success || !result.items) {
        throw new Error('Failed to list src directory');
      }
      
      return {
        itemCount: result.items.length,
        hasJsFiles: result.items.some(item => item.extension === '.js'),
        hasJsxFiles: result.items.some(item => item.extension === '.jsx')
      };
    });

    // Test file validation
    await this.runTest('FileMCP Validate File', async () => {
      const result = await fileMCP.validateFile('package.json');
      if (!result.isValid) {
        throw new Error(`File validation failed: ${result.securityIssues.length} issues found`);
      }
      
      return {
        isValid: result.isValid,
        fileSize: result.size,
        lines: result.lines,
        securityIssues: result.securityIssues.length
      };
    });

    // Test batch operations
    await this.runTest('FileMCP Batch Operations', async () => {
      const operations = [
        {
          type: 'read',
          path: 'package.json'
        },
        {
          type: 'list',
          path: 'src'
        }
      ];
      
      const result = await fileMCP.batchOperations(operations);
      if (!result.success || result.results.length !== 2) {
        throw new Error('Batch operations failed');
      }
      
      return {
        operationCount: result.results.length,
        batchId: result.batchId,
        rollbackAvailable: result.rollbackAvailable
      };
    });

    // Test performance analytics
    await this.runTest('FileMCP Performance Analytics', async () => {
      const analytics = fileMCP.getPerformanceAnalytics();
      
      return {
        operationTypes: Object.keys(analytics),
        totalOperations: Object.values(analytics).reduce((total, op) => total + op.count, 0),
        averagePerformance: Object.values(analytics).reduce((total, op) => total + op.averageMs, 0) / Object.keys(analytics).length
      };
    });

    return fileMCP;
  }

  async testComprehensiveValidator() {
    const validator = new ComprehensiveValidator();
    
    // Test system validation
    await this.runTest('Validator System Check', async () => {
      const result = await validator.validateSystem();
      
      return {
        overallStatus: result.overallStatus,
        validationTime: result.validationTimeMs,
        issueCount: validator.countIssues(result.results),
        recommendationCount: result.recommendations ? result.recommendations.length : 0
      };
    });

    // Test health report
    await this.runTest('Validator Health Report', async () => {
      const report = await validator.getHealthReport();
      
      return {
        validationStatus: report.validation.overallStatus,
        hasHistory: report.history.length > 0,
        hasRecovery: !!report.validation.autoRecovery,
        recoveryAttempts: report.validation.autoRecovery ? report.validation.autoRecovery.attempted : 0
      };
    });

    return validator;
  }

  async testIntegrationScenarios() {
    // Test scenario: File analysis and validation workflow
    await this.runTest('Integration: File Analysis Workflow', async () => {
      const fileMCP = new EnhancedFileMCP();
      const validator = new ComprehensiveValidator();
      
      // 1. Validate system
      const systemCheck = await validator.validateSystem();
      
      // 2. If system is healthy, perform file operations
      if (systemCheck.overallStatus === 'healthy' || systemCheck.overallStatus === 'warning') {
        // Read and validate multiple files
        const files = ['package.json', '.env.example'];
        const results = [];
        
        for (const file of files) {
          try {
            const content = await fileMCP.readFile(file);
            const validation = await fileMCP.validateFile(file);
            
            results.push({
              file,
              readSuccess: content.success,
              validationSuccess: validation.isValid,
              size: content.metadata ? content.metadata.size : 0
            });
          } catch (error) {
            results.push({
              file,
              readSuccess: false,
              validationSuccess: false,
              error: error.message
            });
          }
        }
        
        return {
          systemStatus: systemCheck.overallStatus,
          filesProcessed: results.length,
          successfulReads: results.filter(r => r.readSuccess).length,
          successfulValidations: results.filter(r => r.validationSuccess).length,
          totalSize: results.reduce((total, r) => total + (r.size || 0), 0)
        };
      } else {
        throw new Error(`System not healthy enough for file operations: ${systemCheck.overallStatus}`);
      }
    });

    // Test scenario: Error handling and recovery
    await this.runTest('Integration: Error Handling', async () => {
      const fileMCP = new EnhancedFileMCP();
      
      try {
        // Intentionally try to read a non-existent file
        await fileMCP.readFile('non-existent-file.txt');
        throw new Error('Expected error was not thrown');
      } catch (error) {
        if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
          // Expected error
          const auditTrail = fileMCP.getAuditTrail(5);
          const lastOperation = auditTrail[0];
          
          return {
            errorHandled: true,
            lastOperationFailed: !lastOperation.success,
            auditTrailLength: auditTrail.length,
            errorMessage: error.message
          };
        } else {
          throw error;
        }
      }
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Enhanced MCP Integration Tests...\n');
    
    try {
      // Test Enhanced File MCP
      console.log('📁 Testing Enhanced File MCP...');
      await this.testEnhancedFileMCP();
      console.log('');
      
      // Test Comprehensive Validator
      console.log('🔍 Testing Comprehensive Validator...');
      await this.testComprehensiveValidator();
      console.log('');
      
      // Test Integration Scenarios
      console.log('🔗 Testing Integration Scenarios...');
      await this.testIntegrationScenarios();
      console.log('');
      
      // Calculate final results
      this.results.summary.total = this.results.tests.length;
      
      // Generate summary
      const summary = this.generateSummary();
      console.log(summary);
      
      return this.results;
      
    } catch (error) {
      console.error('💥 Test suite failed:', error.message);
      throw error;
    }
  }

  generateSummary() {
    const { summary, tests } = this.results;
    const successRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(1) : 0;
    
    let summaryText = '\n📊 TEST SUMMARY\n';
    summaryText += '='.repeat(50) + '\n';
    summaryText += `Total Tests: ${summary.total}\n`;
    summaryText += `✅ Passed: ${summary.passed}\n`;
    summaryText += `❌ Failed: ${summary.failed}\n`;
    summaryText += `⏭️  Skipped: ${summary.skipped}\n`;
    summaryText += `📈 Success Rate: ${successRate}%\n`;
    summaryText += '='.repeat(50) + '\n';
    
    if (summary.failed > 0) {
      summaryText += '\n❌ FAILED TESTS:\n';
      const failedTests = tests.filter(test => test.status === 'failed');
      failedTests.forEach(test => {
        summaryText += `  • ${test.name}: ${test.error}\n`;
      });
    }
    
    // Performance summary
    const avgDuration = tests.length > 0 ? 
      tests.reduce((total, test) => total + test.duration, 0) / tests.length : 0;
    
    summaryText += `\n⚡ Performance:\n`;
    summaryText += `  • Average test duration: ${avgDuration.toFixed(1)}ms\n`;
    summaryText += `  • Total execution time: ${tests.reduce((total, test) => total + test.duration, 0)}ms\n`;
    
    return summaryText;
  }

  async saveResults(filename = 'mcp-integration-test-results.json') {
    try {
      const filePath = path.join(process.cwd(), filename);
      await fs.writeFile(filePath, JSON.stringify(this.results, null, 2));
      console.log(`💾 Results saved to: ${filePath}`);
    } catch (error) {
      console.error('Failed to save results:', error.message);
    }
  }
}

// CLI usage
if (require.main === module) {
  const tester = new MCPIntegrationTester();
  
  async function runTests() {
    try {
      const results = await tester.runAllTests();
      await tester.saveResults();
      
      // Exit with appropriate code
      process.exit(results.summary.failed > 0 ? 1 : 0);
      
    } catch (error) {
      console.error('Test suite error:', error.message);
      process.exit(1);
    }
  }
  
  runTests();
}

module.exports = { MCPIntegrationTester };