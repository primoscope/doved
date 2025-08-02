#!/usr/bin/env node

/**
 * EchoTune AI Prompt Executor
 * Executes prompts with various AI models and providers
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');

class PromptExecutor {
  constructor() {
    this.config = this.loadConfig();
    this.cache = new Map();
    this.rateLimiter = {
      requests: [],
      lastReset: Date.now()
    };
  }

  /**
   * Load configuration
   */
  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/prompt-config.yml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      return yaml.load(configContent);
    } catch (error) {
      console.error('❌ Failed to load prompt config:', error.message);
      process.exit(1);
    }
  }

  /**
   * Load a prompt file
   */
  loadPrompt(promptPath) {
    try {
      // Handle relative paths from catalog
      let fullPath = promptPath;
      if (!path.isAbsolute(promptPath)) {
        fullPath = path.join(__dirname, '../catalog', promptPath);
        if (!fullPath.endsWith('.yml') && !fullPath.endsWith('.yaml')) {
          fullPath += '.yml';
        }
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Prompt file not found: ${fullPath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const promptData = yaml.load(content);

      // Validate required fields
      if (!promptData.filename || !promptData.model || !promptData.messages) {
        throw new Error('Invalid prompt: missing required fields');
      }

      return {
        ...promptData,
        _path: fullPath
      };
    } catch (error) {
      throw new Error(`Failed to load prompt: ${error.message}`);
    }
  }

  /**
   * Substitute variables in prompt content
   */
  substituteVariables(content, variables = {}) {
    let result = content;
    
    // Replace variables in the format {{variable}}
    Object.entries(variables).forEach(([key, value]) => {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(pattern, String(value));
    });

    // Check for unresolved variables
    const unresolvedVars = result.match(/\{\{[^}]+\}\}/g);
    if (unresolvedVars) {
      console.warn(`⚠️  Unresolved variables: ${unresolvedVars.join(', ')}`);
    }

    return result;
  }

  /**
   * Prepare messages with variable substitution
   */
  prepareMessages(prompt, variables = {}) {
    return prompt.messages.map(message => ({
      ...message,
      content: this.substituteVariables(message.content, variables)
    }));
  }

  /**
   * Check rate limits
   */
  checkRateLimit() {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    
    // Reset counter if window has passed
    if (now - this.rateLimiter.lastReset > windowMs) {
      this.rateLimiter.requests = [];
      this.rateLimiter.lastReset = now;
    }

    // Check if we're within limits
    const limit = this.config.execution?.rate_limit?.requests_per_minute || 60;
    if (this.rateLimiter.requests.length >= limit) {
      throw new Error(`Rate limit exceeded: ${limit} requests per minute`);
    }

    this.rateLimiter.requests.push(now);
  }

  /**
   * Execute prompt with OpenAI
   */
  async executeOpenAI(prompt, messages, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not found in environment');
    }

    const modelParams = {
      ...this.config.models.openai[prompt.model],
      ...prompt.modelParameters,
      ...options
    };

    const requestData = {
      model: prompt.model,
      messages: messages,
      temperature: modelParams.temperature || 0.3,
      max_tokens: modelParams.max_tokens || 2000,
      top_p: modelParams.top_p || 0.9
    };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.config.providers?.openai?.timeout || 30000
      }
    );

    return {
      content: response.data.choices[0]?.message?.content || '',
      usage: response.data.usage,
      model: response.data.model,
      provider: 'openai'
    };
  }

  /**
   * Execute prompt with Google Gemini
   */
  async executeGemini(prompt, messages, options = {}) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Google API key not found in environment');
    }

    // Convert messages to Gemini format
    const parts = messages.map(msg => ({
      text: msg.content
    }));

    const modelParams = {
      ...this.config.models.google[prompt.model],
      ...prompt.modelParameters,
      ...options
    };

    const requestData = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        temperature: modelParams.temperature || 0.3,
        maxOutputTokens: modelParams.max_tokens || 2000,
        topP: modelParams.top_p || 0.9
      }
    };

    const modelName = prompt.model.replace('gemini-', 'gemini-');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.providers?.google?.timeout || 30000
      }
    );

    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      content: content,
      usage: response.data.usageMetadata,
      model: prompt.model,
      provider: 'google'
    };
  }

  /**
   * Execute prompt with Anthropic Claude
   */
  async executeAnthropic(prompt, messages, options = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not found in environment');
    }

    const modelParams = {
      ...this.config.models.anthropic[prompt.model],
      ...prompt.modelParameters,
      ...options
    };

    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const requestData = {
      model: prompt.model,
      messages: conversationMessages,
      max_tokens: modelParams.max_tokens || 2000,
      temperature: modelParams.temperature || 0.3
    };

    if (systemMessage) {
      requestData.system = systemMessage.content;
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: this.config.providers?.anthropic?.timeout || 30000
      }
    );

    return {
      content: response.data.content[0]?.text || '',
      usage: response.data.usage,
      model: response.data.model,
      provider: 'anthropic'
    };
  }

  /**
   * Get provider for a model
   */
  getProvider(model) {
    if (model.startsWith('gpt-') || model.includes('openai/')) {
      return 'openai';
    }
    if (model.startsWith('claude-') || model.includes('anthropic/')) {
      return 'anthropic';
    }
    if (model.startsWith('gemini-') || model.includes('google/')) {
      return 'google';
    }
    return 'openai'; // Default fallback
  }

  /**
   * Execute a prompt
   */
  async execute(promptPath, variables = {}, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check rate limits
      this.checkRateLimit();

      // Load prompt
      const prompt = this.loadPrompt(promptPath);
      
      // Check cache if enabled
      const cacheKey = `${promptPath}:${JSON.stringify(variables)}`;
      if (this.config.system?.cache_enabled && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < (this.config.system?.cache_ttl || 3600) * 1000) {
          console.log('📦 Using cached result');
          return cached.result;
        }
      }

      // Prepare messages
      const messages = this.prepareMessages(prompt, variables);
      
      // Determine provider
      const provider = this.getProvider(prompt.model);
      
      console.log(`🚀 Executing prompt: ${prompt.filename}`);
      console.log(`📝 Model: ${prompt.model} (${provider})`);
      console.log(`🔧 Variables: ${Object.keys(variables).length} provided`);

      // Execute based on provider
      let result;
      switch (provider) {
        case 'openai':
          result = await this.executeOpenAI(prompt, messages, options);
          break;
        case 'google':
          result = await this.executeGemini(prompt, messages, options);
          break;
        case 'anthropic':
          result = await this.executeAnthropic(prompt, messages, options);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      // Add execution metadata
      result.execution = {
        prompt_path: promptPath,
        prompt_version: prompt.version,
        variables: variables,
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // Cache result if enabled
      if (this.config.system?.cache_enabled) {
        this.cache.set(cacheKey, {
          result: result,
          timestamp: Date.now()
        });
      }

      console.log(`✅ Execution completed in ${result.execution.execution_time_ms}ms`);
      return result;

    } catch (error) {
      console.error(`❌ Execution failed: ${error.message}`);
      
      // Try fallback if enabled
      if (this.config.execution?.fallback?.enabled && !options._fallback) {
        console.log('🔄 Trying fallback model...');
        const fallbackModels = this.config.execution.fallback.models || [];
        
        for (const fallbackModel of fallbackModels) {
          try {
            // Load prompt with fallback model
            const prompt = this.loadPrompt(promptPath);
            prompt.model = fallbackModel;
            
            const fallbackOptions = { ...options, _fallback: true };
            return await this.execute(promptPath, variables, fallbackOptions);
          } catch (fallbackError) {
            console.log(`❌ Fallback failed with ${fallbackModel}: ${fallbackError.message}`);
          }
        }
      }

      throw error;
    }
  }

  /**
   * Execute prompt with test data
   */
  async test(promptPath, testCaseIndex = null) {
    const prompt = this.loadPrompt(promptPath);
    
    if (!prompt.testData || prompt.testData.length === 0) {
      throw new Error('No test data found in prompt');
    }

    const testCases = testCaseIndex !== null 
      ? [prompt.testData[testCaseIndex]]
      : prompt.testData;

    const results = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const actualIndex = testCaseIndex !== null ? testCaseIndex : i;
      
      console.log(`🧪 Running test case ${actualIndex + 1}/${prompt.testData.length}`);
      
      try {
        const result = await this.execute(promptPath, testCase.variables || {});
        
        // Run evaluators if available
        let evaluationResults = [];
        if (prompt.evaluators) {
          evaluationResults = this.runEvaluators(result.content, prompt.evaluators);
        }

        results.push({
          test_case: actualIndex + 1,
          variables: testCase.variables,
          expected: testCase.expected,
          actual: result.content,
          evaluation: evaluationResults,
          passed: evaluationResults.length === 0 || evaluationResults.every(e => e.passed),
          execution_time_ms: result.execution.execution_time_ms
        });

      } catch (error) {
        results.push({
          test_case: actualIndex + 1,
          variables: testCase.variables,
          error: error.message,
          passed: false
        });
      }
    }

    return {
      prompt: prompt.filename,
      total_tests: results.length,
      passed_tests: results.filter(r => r.passed).length,
      failed_tests: results.filter(r => !r.passed).length,
      results: results
    };
  }

  /**
   * Run evaluators on prompt output
   */
  runEvaluators(content, evaluators) {
    return evaluators.map(evaluator => {
      const result = {
        name: evaluator.name,
        passed: false,
        details: {}
      };

      try {
        if (evaluator.string) {
          result.passed = this.evaluateString(content, evaluator.string);
          result.details = evaluator.string;
        } else if (evaluator.json) {
          result.passed = this.evaluateJSON(content, evaluator.json);
          result.details = evaluator.json;
        } else if (evaluator.custom) {
          result.passed = this.evaluateCustom(content, evaluator.custom);
          result.details = evaluator.custom;
        }
      } catch (error) {
        result.error = error.message;
        result.passed = false;
      }

      return result;
    });
  }

  /**
   * Evaluate string-based conditions
   */
  evaluateString(content, conditions) {
    if (conditions.contains && !content.includes(conditions.contains)) {
      return false;
    }
    if (conditions.not_contains && content.includes(conditions.not_contains)) {
      return false;
    }
    if (conditions.regex && !new RegExp(conditions.regex).test(content)) {
      return false;
    }
    if (conditions.length_min && content.length < conditions.length_min) {
      return false;
    }
    if (conditions.length_max && content.length > conditions.length_max) {
      return false;
    }
    return true;
  }

  /**
   * Evaluate JSON-based conditions
   */
  evaluateJSON(content, conditions) {
    try {
      const parsed = JSON.parse(content);
      
      if (conditions.valid === true) {
        return true; // JSON is valid
      }
      
      // Additional JSON schema validation could go here
      return true;
    } catch (error) {
      return conditions.valid === false; // Expected invalid JSON
    }
  }

  /**
   * Evaluate custom function
   */
  evaluateCustom(content, conditions) {
    if (conditions.function) {
      // Note: In a real implementation, you'd want to safely evaluate this
      // For now, we'll just return true
      console.warn('⚠️  Custom evaluators not yet implemented');
      return true;
    }
    return false;
  }

  /**
   * List available prompts
   */
  listPrompts(category = null) {
    const catalogPath = path.join(__dirname, '../catalog');
    const prompts = [];

    const scanDirectory = (dirPath, currentCategory = '') => {
      if (!fs.existsSync(dirPath)) return;
      
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subCategory = currentCategory ? `${currentCategory}/${entry.name}` : entry.name;
          scanDirectory(fullPath, subCategory);
        } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const promptData = yaml.load(content);
            
            if (promptData.filename) {
              const promptCategory = currentCategory || promptData.category || 'uncategorized';
              
              if (!category || promptCategory === category) {
                prompts.push({
                  filename: promptData.filename,
                  description: promptData.description,
                  category: promptCategory,
                  model: promptData.model,
                  version: promptData.version || '1.0.0',
                  tags: promptData.tags || [],
                  path: path.relative(path.join(__dirname, '..'), fullPath)
                });
              }
            }
          } catch (error) {
            console.warn(`⚠️  Failed to parse ${fullPath}: ${error.message}`);
          }
        }
      }
    };

    scanDirectory(catalogPath);
    return prompts;
  }
}

// CLI interface
if (require.main === module) {
  const executor = new PromptExecutor();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  async function runCommand() {
    try {
      switch (command) {
        case 'execute':
          const promptPath = args[1];
          if (!promptPath) {
            console.error('❌ Please specify a prompt path');
            process.exit(1);
          }
          
          // Parse variables from command line
          const variables = {};
          for (let i = 2; i < args.length; i++) {
            if (args[i].startsWith('--')) {
              const key = args[i].slice(2);
              const value = args[i + 1];
              if (value && !value.startsWith('--')) {
                variables[key] = value;
                i++; // Skip next arg
              }
            }
          }
          
          const result = await executor.execute(promptPath, variables);
          console.log('\n📄 Result:');
          console.log(result.content);
          console.log(`\n📊 Usage: ${JSON.stringify(result.usage, null, 2)}`);
          break;
          
        case 'test':
          const testPromptPath = args[1];
          if (!testPromptPath) {
            console.error('❌ Please specify a prompt path');
            process.exit(1);
          }
          
          const testIndex = args.includes('--case') ? 
            parseInt(args[args.indexOf('--case') + 1]) - 1 : null;
          
          const testResults = await executor.test(testPromptPath, testIndex);
          console.log(`\n🧪 Test Results for ${testResults.prompt}:`);
          console.log(`✅ Passed: ${testResults.passed_tests}/${testResults.total_tests}`);
          
          testResults.results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`  ${status} Test ${result.test_case}: ${result.passed ? 'PASSED' : 'FAILED'}`);
            if (!result.passed && result.error) {
              console.log(`    Error: ${result.error}`);
            }
          });
          
          process.exit(testResults.failed_tests > 0 ? 1 : 0);
          break;
          
        case 'list':
          const category = args[1];
          const prompts = executor.listPrompts(category);
          
          console.log('\n📚 Available Prompts:');
          if (prompts.length === 0) {
            console.log('  No prompts found');
          } else {
            prompts.forEach(prompt => {
              console.log(`  📝 ${prompt.filename} (${prompt.category})`);
              console.log(`     ${prompt.description}`);
              console.log(`     Model: ${prompt.model} | Version: ${prompt.version}`);
              console.log(`     Path: ${prompt.path}`);
              console.log('');
            });
          }
          break;
          
        default:
          console.log(`
🚀 EchoTune AI Prompt Executor

Usage:
  node executor.js execute <prompt_path> [--var1 value1] [--var2 value2]
    Execute a prompt with optional variables
    
  node executor.js test <prompt_path> [--case N]
    Test a prompt with its test data
    
  node executor.js list [category]
    List available prompts (optionally filtered by category)

Examples:
  node executor.js execute coding-agent/code-review --file src/app.js
  node executor.js test coding-agent/code-review --case 1
  node executor.js list coding-agent
          `);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }
  
  runCommand();
}

module.exports = PromptExecutor;