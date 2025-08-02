#!/usr/bin/env node

/**
 * Gemini Code Assist Integration Test
 * Tests connectivity and basic functionality of Gemini API
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

class GeminiIntegrationTest {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.client = null;
    this.results = {
      connectivity: false,
      codeReview: false,
      musicDomain: false,
      configValidation: false
    };
  }

  async initialize() {
    console.log('🧠 Gemini Code Assist Integration Test');
    console.log('======================================');
    
    if (!this.apiKey) {
      console.log('❌ GEMINI_API_KEY not found in environment variables');
      console.log('💡 Please add your Gemini API key to .env file');
      console.log('   Get your key from: https://aistudio.google.com/app/apikey');
      return false;
    }

    try {
      this.client = new GoogleGenerativeAI(this.apiKey);
      console.log('✅ Gemini client initialized');
      return true;
    } catch (error) {
      console.log('❌ Failed to initialize Gemini client:', error.message);
      return false;
    }
  }

  async testConnectivity() {
    console.log('\n🔍 Testing API Connectivity...');
    
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const result = await model.generateContent('Hello, Gemini! Please respond with "Connection successful"');
      const response = await result.response;
      const text = response.text();
      
      if (text.toLowerCase().includes('connection successful') || text.toLowerCase().includes('hello')) {
        console.log('✅ API connectivity successful');
        console.log(`📝 Response: ${text.substring(0, 100)}...`);
        this.results.connectivity = true;
      } else {
        console.log('⚠️ API connected but unexpected response:', text.substring(0, 100));
        this.results.connectivity = true; // Still connected
      }
    } catch (error) {
      console.log('❌ API connectivity failed:', error.message);
      this.results.connectivity = false;
    }
  }

  async testCodeReview() {
    console.log('\n🔍 Testing Code Review Capabilities...');
    
    const testCode = `
    // Sample JavaScript code with potential issues
    function processSpotifyTracks(tracks) {
      var results = [];
      for (var i = 0; i < tracks.length; i++) {
        results.push(tracks[i].name);
      }
      return results;
    }
    `;

    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const prompt = `
        Please review this JavaScript code for potential improvements:
        ${testCode}
        
        Focus on:
        1. Code quality and modern JavaScript practices
        2. Performance considerations
        3. Best practices for music/Spotify applications
        
        Provide specific, actionable feedback.
      `;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (text.length > 50 && (text.includes('const') || text.includes('let') || text.includes('performance'))) {
        console.log('✅ Code review capabilities working');
        console.log(`📝 Sample feedback: ${text.substring(0, 200)}...`);
        this.results.codeReview = true;
      } else {
        console.log('⚠️ Code review response unclear:', text.substring(0, 100));
        this.results.codeReview = false;
      }
    } catch (error) {
      console.log('❌ Code review test failed:', error.message);
      this.results.codeReview = false;
    }
  }

  async testMusicDomainKnowledge() {
    console.log('\n🔍 Testing Music Domain Knowledge...');
    
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const prompt = `
        You are helping with a Spotify music recommendation system. 
        Explain what the "danceability" audio feature means and how it might be used 
        in a recommendation algorithm. Keep it concise but technical.
      `;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (text.toLowerCase().includes('danceability') && text.toLowerCase().includes('music')) {
        console.log('✅ Music domain knowledge working');
        console.log(`📝 Response: ${text.substring(0, 150)}...`);
        this.results.musicDomain = true;
      } else {
        console.log('⚠️ Music domain response unclear:', text.substring(0, 100));
        this.results.musicDomain = false;
      }
    } catch (error) {
      console.log('❌ Music domain test failed:', error.message);
      this.results.musicDomain = false;
    }
  }

  async validateConfiguration() {
    console.log('\n🔍 Validating Gemini Configuration Files...');
    
    const configPath = path.join(__dirname, '..', '.gemini', 'config.json');
    const rulesPath = path.join(__dirname, '..', '.gemini', 'rules.md');
    const promptsPath = path.join(__dirname, '..', '.gemini', 'prompts.md');
    const workflowPath = path.join(__dirname, '..', '.gemini', 'workflow.yml');
    
    let validFiles = 0;
    const requiredFiles = 4;
    
    // Check config.json
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.version && config.settings) {
          console.log('✅ config.json is valid');
          validFiles++;
        } else {
          console.log('⚠️ config.json exists but structure is incomplete');
        }
      } catch (error) {
        console.log('❌ config.json is invalid JSON:', error.message);
      }
    } else {
      console.log('❌ config.json not found');
    }
    
    // Check other files
    [
      { path: rulesPath, name: 'rules.md' },
      { path: promptsPath, name: 'prompts.md' },
      { path: workflowPath, name: 'workflow.yml' }
    ].forEach(file => {
      if (fs.existsSync(file.path)) {
        const content = fs.readFileSync(file.path, 'utf8');
        if (content.length > 100) {
          console.log(`✅ ${file.name} exists and has content`);
          validFiles++;
        } else {
          console.log(`⚠️ ${file.name} exists but seems incomplete`);
        }
      } else {
        console.log(`❌ ${file.name} not found`);
      }
    });
    
    this.results.configValidation = validFiles === requiredFiles;
    
    if (this.results.configValidation) {
      console.log('✅ All configuration files are valid');
    } else {
      console.log(`⚠️ Configuration validation incomplete (${validFiles}/${requiredFiles} files valid)`);
    }
  }

  generateReport() {
    console.log('\n📊 Test Results Summary');
    console.log('========================');
    
    const tests = [
      { name: 'API Connectivity', status: this.results.connectivity },
      { name: 'Code Review', status: this.results.codeReview },
      { name: 'Music Domain Knowledge', status: this.results.musicDomain },
      { name: 'Configuration Files', status: this.results.configValidation }
    ];
    
    tests.forEach(test => {
      const status = test.status ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${test.name}`);
    });
    
    const passedTests = tests.filter(t => t.status).length;
    const totalTests = tests.length;
    
    console.log(`\n📈 Overall Score: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Gemini Code Assist is fully configured.');
    } else if (passedTests >= totalTests * 0.75) {
      console.log('⚠️ Most tests passed. Minor configuration issues detected.');
    } else {
      console.log('❌ Several tests failed. Please check configuration and API key.');
    }
    
    console.log('\n💡 Next Steps:');
    if (!this.results.connectivity) {
      console.log('   - Verify GEMINI_API_KEY in .env file');
      console.log('   - Check internet connectivity');
      console.log('   - Verify API key permissions');
    }
    if (!this.results.configValidation) {
      console.log('   - Ensure all .gemini/ configuration files are present');
      console.log('   - Verify JSON syntax in config.json');
    }
    if (passedTests < totalTests) {
      console.log('   - Review the specific test failures above');
      console.log('   - Check the Gemini Code Assist documentation');
    }
    
    return passedTests === totalTests;
  }

  async runAllTests() {
    const initialized = await this.initialize();
    if (!initialized) {
      return false;
    }
    
    await this.testConnectivity();
    
    if (this.results.connectivity) {
      await this.testCodeReview();
      await this.testMusicDomainKnowledge();
    }
    
    await this.validateConfiguration();
    
    return this.generateReport();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new GeminiIntegrationTest();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = GeminiIntegrationTest;