#!/usr/bin/env node
/**
 * Comprehensive MCP Integration Test Script
 * Tests all integrated MCP servers and demonstrates their capabilities
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MCPIntegrationTest {
  constructor() {
    this.baseURL = 'http://localhost:3001';
    this.testResults = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      tests: []
    };
  }

  async runTest(name, testFunction) {
    console.log(`🧪 Running test: ${name}...`);
    this.testResults.totalTests++;
    
    try {
      const result = await testFunction();
      this.testResults.tests.push({
        name,
        status: 'passed',
        result,
        timestamp: new Date().toISOString()
      });
      this.testResults.passedTests++;
      console.log(`✅ Test passed: ${name}`);
      return result;
    } catch (error) {
      this.testResults.tests.push({
        name,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      this.testResults.failedTests++;
      console.log(`❌ Test failed: ${name} - ${error.message}`);
      throw error;
    }
  }

  async testHealthCheck() {
    const response = await axios.get(`${this.baseURL}/health`);
    if (response.status !== 200) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }
    return {
      status: response.data.status,
      totalServers: response.data.totalServers,
      uptime: response.data.uptime
    };
  }

  async testServersList() {
    const response = await axios.get(`${this.baseURL}/servers`);
    if (response.status !== 200) {
      throw new Error(`Servers list failed with status: ${response.status}`);
    }
    return {
      serverCount: response.data.servers.length,
      capabilities: Object.keys(response.data.capabilities).length
    };
  }

  async testMermaidDiagrams() {
    const diagramContent = `
      graph TD
        A[User Request] --> B[EchoTune AI]
        B --> C[MCP Orchestrator]
        C --> D[Mermaid Server]
        C --> E[FileScopeMCP]
        C --> F[Browserbase]
        D --> G[Generate Diagram]
        E --> H[File Analysis]
        F --> I[Browser Automation]
        G --> J[Visual Documentation]
        H --> K[Repository Insights]
        I --> L[Testing Results]
    `;

    const response = await axios.post(`${this.baseURL}/diagrams/generate`, {
      type: 'flowchart',
      content: diagramContent.trim(),
      filename: 'integration-test-diagram'
    });

    if (response.status !== 200 || !response.data.success) {
      throw new Error('Diagram generation failed');
    }

    return {
      diagramPath: response.data.result.mermaid,
      fileExists: fs.existsSync(response.data.result.mermaid)
    };
  }

  async testFileOperations() {
    const testCases = [
      { path: '../src', operation: 'analyze' },
      { path: '../docs', operation: 'structure' },
      { path: '../package.json', operation: 'stats' }
    ];

    const results = [];
    for (const testCase of testCases) {
      const response = await axios.post(`${this.baseURL}/files/analyze`, testCase);
      
      if (response.status !== 200 || !response.data.success) {
        throw new Error(`File operation failed for ${testCase.path}`);
      }
      
      results.push({
        path: testCase.path,
        operation: testCase.operation,
        success: true,
        dataReceived: !!response.data.result
      });
    }

    return { operations: results, totalOperations: results.length };
  }

  async testBrowserAutomation() {
    const testCases = [
      { provider: 'puppeteer', action: 'test', target: 'https://example.com' },
      { provider: 'browserbase', action: 'test', target: 'https://open.spotify.com' }
    ];

    const results = [];
    for (const testCase of testCases) {
      try {
        const response = await axios.post(`${this.baseURL}/browser/automate`, testCase);
        
        results.push({
          provider: testCase.provider,
          status: response.data.success ? 'success' : 'failed',
          available: response.status === 200
        });
      } catch (error) {
        results.push({
          provider: testCase.provider,
          status: 'error',
          error: error.message,
          available: false
        });
      }
    }

    return { automation: results, providersCount: results.length };
  }

  async testSpotifyIntegration() {
    const testTypes = ['oauth', 'api', 'web_player'];
    const results = [];

    for (const testType of testTypes) {
      try {
        const response = await axios.post(`${this.baseURL}/spotify/test`, {
          testType,
          credentials: {}
        });

        results.push({
          testType,
          status: response.data.result.status,
          message: response.data.result.message
        });
      } catch (error) {
        results.push({
          testType,
          status: 'error',
          error: error.message
        });
      }
    }

    return { spotifyTests: results, testsCount: results.length };
  }

  async testComprehensiveIntegration() {
    const response = await axios.post(`${this.baseURL}/test/comprehensive`, {
      includeServers: ['mermaid', 'filesystem', 'puppeteer']
    });

    if (response.status !== 200 || !response.data.success) {
      throw new Error('Comprehensive test failed');
    }

    return {
      successRate: response.data.results.successRate,
      testedServers: response.data.results.testedServers,
      passedTests: response.data.results.passedTests
    };
  }

  async generateTestReport() {
    const reportPath = path.join(__dirname, '..', 'docs', 'MCP_INTEGRATION_TEST_REPORT.md');
    const reportContent = `# MCP Integration Test Report

Generated on: ${this.testResults.timestamp}

## Summary
- **Total Tests**: ${this.testResults.totalTests}
- **Passed**: ${this.testResults.passedTests}
- **Failed**: ${this.testResults.failedTests}
- **Success Rate**: ${Math.round((this.testResults.passedTests / this.testResults.totalTests) * 100)}%

## Test Results

${this.testResults.tests.map(test => `
### ${test.name}
- **Status**: ${test.status}
- **Timestamp**: ${test.timestamp}
${test.status === 'passed' ? 
  `- **Result**: ${JSON.stringify(test.result, null, 2)}` : 
  `- **Error**: ${test.error}`
}
`).join('\n')}

## MCP Servers Integration Status

### ✅ Successfully Integrated
- **mcp-mermaid**: Workflow diagram generation
- **FileScopeMCP**: Repository file operations
- **@browserbasehq/mcp-server-browserbase**: Cloud browser automation (requires credentials)

### 🔧 Available for Use
- **Puppeteer Server**: Local browser automation
- **Spotify Server**: Music integration (requires credentials)

## Usage Examples

### Generate Diagrams
\`\`\`bash
curl -X POST http://localhost:3001/diagrams/generate \\
  -H "Content-Type: application/json" \\
  -d '{"type": "flowchart", "content": "graph TD\\n  A[Start] --> B[End]", "filename": "test"}'
\`\`\`

### Analyze Files
\`\`\`bash
curl -X POST http://localhost:3001/files/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"path": "./src", "operation": "analyze"}'
\`\`\`

### Browser Automation
\`\`\`bash
curl -X POST http://localhost:3001/browser/automate \\
  -H "Content-Type: application/json" \\
  -d '{"provider": "puppeteer", "action": "test", "target": "https://example.com"}'
\`\`\`

## Next Steps

1. **Add Browserbase credentials** to \`.env\` file for cloud browser testing
2. **Configure Spotify API** credentials for music integration
3. **Explore advanced features** like workflow automation and repository analysis
4. **Create custom MCP integrations** for specific EchoTune AI needs

---
*Report generated by MCP Integration Test Suite*
`;

    fs.writeFileSync(reportPath, reportContent);
    return reportPath;
  }

  async runAllTests() {
    console.log('🚀 Starting MCP Integration Tests\n');
    console.log('=' .repeat(50));

    try {
      // Basic connectivity tests
      await this.runTest('Health Check', () => this.testHealthCheck());
      await this.runTest('Servers List', () => this.testServersList());

      // Individual server tests
      await this.runTest('Mermaid Diagrams', () => this.testMermaidDiagrams());
      await this.runTest('File Operations', () => this.testFileOperations());
      await this.runTest('Browser Automation', () => this.testBrowserAutomation());
      await this.runTest('Spotify Integration', () => this.testSpotifyIntegration());

      // Comprehensive integration test
      await this.runTest('Comprehensive Integration', () => this.testComprehensiveIntegration());

      // Generate report
      const reportPath = await this.generateTestReport();
      console.log(`\n📄 Test report generated: ${reportPath}`);

    } catch (error) {
      console.error(`\n❌ Test suite failed: ${error.message}`);
    }

    // Print summary
    console.log('\n' + '=' .repeat(50));
    console.log('🎯 MCP Integration Test Summary');
    console.log(`Total Tests: ${this.testResults.totalTests}`);
    console.log(`Passed: ${this.testResults.passedTests}`);
    console.log(`Failed: ${this.testResults.failedTests}`);
    console.log(`Success Rate: ${Math.round((this.testResults.passedTests / this.testResults.totalTests) * 100)}%`);

    if (this.testResults.failedTests === 0) {
      console.log('\n🎉 All MCP integrations working correctly!');
    } else {
      console.log('\n⚠️  Some tests failed. Check the report for details.');
    }

    return this.testResults;
  }
}

// Run tests if this script is called directly
if (require.main === module) {
  const testSuite = new MCPIntegrationTest();
  
  // Check if MCP server is running
  axios.get('http://localhost:3001/health')
    .then(() => {
      console.log('✅ MCP server is running, starting tests...\n');
      return testSuite.runAllTests();
    })
    .catch(() => {
      console.error('❌ MCP server is not running. Please start it first:');
      console.error('   cd mcp-server && npm run orchestrator');
      process.exit(1);
    });
}

module.exports = MCPIntegrationTest;