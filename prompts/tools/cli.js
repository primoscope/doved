#!/usr/bin/env node

/**
 * EchoTune AI Prompt CLI
 * Command-line interface for prompt management
 */

const path = require('path');
const { spawn } = require('child_process');

class PromptCLI {
  constructor() {
    this.commands = {
      validate: 'Validate prompt files',
      execute: 'Execute a prompt',
      test: 'Test a prompt with test data',
      list: 'List available prompts',
      fix: 'Auto-fix prompt files',
      init: 'Initialize a new prompt',
      migrate: 'Migrate old format prompts',
      server: 'Start prompt API server'
    };
  }

  /**
   * Display help information
   */
  showHelp() {
    console.log(`
🎵 EchoTune AI Prompt Management CLI
===================================

Usage: prompts <command> [options]

Commands:
  validate [path]              Validate prompt files
  execute <prompt> [vars]      Execute a prompt  
  test <prompt> [case]         Test a prompt
  list [category]              List available prompts
  fix <file>                   Auto-fix prompt issues
  init <name>                  Create a new prompt
  migrate <source>             Migrate old format prompts
  server [port]                Start API server

Examples:
  prompts validate
  prompts execute coding-agent/code-review --file=src/app.js
  prompts test coding-agent/code-review --case=1
  prompts list coding-agent
  prompts fix catalog/coding-agent/code-review.yml
  prompts init my-new-prompt --category=analysis
  prompts migrate .github/workflows/prompts/
  prompts server 3002

Options:
  --help, -h                   Show this help
  --version, -v                Show version
  --verbose                    Verbose output
  --json                       JSON output format
  --dry-run                    Don't make changes
    `);
  }

  /**
   * Run a tool script
   */
  async runTool(toolName, args = []) {
    return new Promise((resolve, reject) => {
      const toolPath = path.join(__dirname, `${toolName}.js`);
      
      // Fix relative paths - if argument looks like a relative path, make it absolute
      const fixedArgs = args.map(arg => {
        if (arg.startsWith('prompts/') && !path.isAbsolute(arg)) {
          return path.join(process.cwd(), arg);
        }
        return arg;
      });
      
      const child = spawn('node', [toolPath, ...fixedArgs], {
        stdio: 'inherit',
        cwd: process.cwd() // Use project root as working directory
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${toolName} exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Initialize a new prompt
   */
  async initPrompt(name, options = {}) {
    const { category = 'coding-agent', model = 'gpt-4o' } = options;
    
    const promptTemplate = `# ${name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
filename: ${name}
description: Description of what this prompt does
version: "1.0.0"
category: ${category}
tags: [${category}, automation]

# Model Configuration
model: ${model}
modelParameters:
  temperature: 0.3
  max_tokens: 2000
  top_p: 0.9

# Variables (optional)
variables:
  input_text:
    type: string
    description: Text to process
    required: true
  context:
    type: string
    description: Additional context
    required: false
    default: ""

# Prompt Messages
messages:
  - role: system
    content: |
      You are an AI assistant for EchoTune AI.
      
      Your task is to process the provided input and generate a helpful response.
      
      Guidelines:
      - Be concise and accurate
      - Follow the specific requirements
      - Provide actionable insights
      
  - role: user
    content: |
      Please process the following input:
      
      Input: {{input_text}}
      
      Context: {{context}}
      
      Please provide your analysis and recommendations.

# Test Data
testData:
  - variables:
      input_text: "Sample input text"
      context: "Sample context"
    expected: "Should contain analysis and recommendations"

# Validation Rules
evaluators:
  - name: Contains analysis
    string:
      contains: "analysis"
  - name: Minimum length
    string:
      length_min: 50

# Metadata
metadata:
  author: "EchoTune AI Team"
  created: "${new Date().toISOString()}"
  license: "MIT"
`;

    const fs = require('fs');
    const outputPath = path.join(__dirname, '../catalog', category, `${name}.yml`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(outputPath)) {
      throw new Error(`Prompt already exists: ${outputPath}`);
    }

    fs.writeFileSync(outputPath, promptTemplate);
    console.log(`✅ Created new prompt: ${outputPath}`);
    
    return outputPath;
  }

  /**
   * Migrate old format prompts
   */
  async migratePrompts(sourcePath) {
    const fs = require('fs');
    const yaml = require('js-yaml');
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source path not found: ${sourcePath}`);
    }

    const migrated = [];
    const errors = [];

    const processFile = (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const oldData = yaml.load(content);

        // Convert old format to new format
        const newPrompt = {
          filename: oldData.filename || path.basename(filePath, '.yml'),
          description: oldData.description || 'Migrated prompt',
          version: '1.0.0',
          category: 'automation', // Default category
          model: oldData.model || 'gpt-4o',
          modelParameters: oldData.modelParameters || {
            temperature: 0.3,
            max_tokens: 2000
          },
          messages: oldData.messages || [],
          metadata: {
            author: 'Migrated from old format',
            created: new Date().toISOString(),
            migrated: true
          }
        };

        // Add test data if present
        if (oldData.testData) {
          newPrompt.testData = oldData.testData;
        }

        // Add evaluators if present
        if (oldData.evaluators) {
          newPrompt.evaluators = oldData.evaluators;
        }

        const outputPath = path.join(
          __dirname, 
          '../catalog/automation', 
          `${newPrompt.filename}.yml`
        );

        // Create output directory
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, yaml.dump(newPrompt, { indent: 2 }));
        migrated.push(outputPath);

      } catch (error) {
        errors.push({ file: filePath, error: error.message });
      }
    };

    // Process files
    if (fs.statSync(sourcePath).isDirectory()) {
      const files = fs.readdirSync(sourcePath);
      for (const file of files) {
        if (file.endsWith('.yml') || file.endsWith('.yaml')) {
          processFile(path.join(sourcePath, file));
        }
      }
    } else {
      processFile(sourcePath);
    }

    console.log(`✅ Migrated ${migrated.length} prompts`);
    if (errors.length > 0) {
      console.log(`❌ ${errors.length} errors:`);
      errors.forEach(({ file, error }) => {
        console.log(`  ${file}: ${error}`);
      });
    }

    return { migrated, errors };
  }

  /**
   * Start API server
   */
  async startServer(port = 3002) {
    const express = require('express');
    const cors = require('cors');
    const PromptExecutor = require('./executor');
    
    const app = express();
    const executor = new PromptExecutor();

    app.use(cors());
    app.use(express.json());

    // List prompts endpoint
    app.get('/api/prompts', (req, res) => {
      try {
        const { category } = req.query;
        const prompts = executor.listPrompts(category);
        res.json({ prompts });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Execute prompt endpoint
    app.post('/api/prompts/execute', async (req, res) => {
      try {
        const { prompt, variables, options } = req.body;
        const result = await executor.execute(prompt, variables, options);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test prompt endpoint
    app.post('/api/prompts/test', async (req, res) => {
      try {
        const { prompt, testCase } = req.body;
        const result = await executor.test(prompt, testCase);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'EchoTune AI Prompt API' });
    });

    app.listen(port, () => {
      console.log(`🚀 Prompt API server running on port ${port}`);
      console.log(`📚 API endpoints:`);
      console.log(`  GET  /api/prompts - List prompts`);
      console.log(`  POST /api/prompts/execute - Execute prompt`);
      console.log(`  POST /api/prompts/test - Test prompt`);
      console.log(`  GET  /health - Health check`);
    });
  }

  /**
   * Main CLI entry point
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    try {
      switch (command) {
        case 'validate':
          await this.runTool('validator', ['validate', ...commandArgs]);
          break;

        case 'execute':
          await this.runTool('executor', ['execute', ...commandArgs]);
          break;

        case 'test':
          await this.runTool('executor', ['test', ...commandArgs]);
          break;

        case 'list':
          await this.runTool('executor', ['list', ...commandArgs]);
          break;

        case 'fix':
          await this.runTool('validator', ['fix', ...commandArgs]);
          break;

        case 'init':
          const promptName = commandArgs[0];
          if (!promptName) {
            console.error('❌ Please specify a prompt name');
            process.exit(1);
          }
          
          const options = {};
          if (commandArgs.includes('--category')) {
            options.category = commandArgs[commandArgs.indexOf('--category') + 1];
          }
          if (commandArgs.includes('--model')) {
            options.model = commandArgs[commandArgs.indexOf('--model') + 1];
          }
          
          await this.initPrompt(promptName, options);
          break;

        case 'migrate':
          const sourcePath = commandArgs[0];
          if (!sourcePath) {
            console.error('❌ Please specify a source path');
            process.exit(1);
          }
          
          await this.migratePrompts(sourcePath);
          break;

        case 'server':
          const port = commandArgs[0] ? parseInt(commandArgs[0]) : 3002;
          await this.startServer(port);
          break;

        default:
          console.error(`❌ Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const cli = new PromptCLI();
  cli.run();
}

module.exports = PromptCLI;