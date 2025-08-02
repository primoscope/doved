#!/usr/bin/env node

/**
 * EchoTune AI Prompt Validator
 * Validates prompt files against the schema and configuration
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class PromptValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.schema = this.loadSchema();
    this.config = this.loadConfig();
    this.validate = this.ajv.compile(this.schema);
  }

  /**
   * Load the JSON schema for prompt validation
   */
  loadSchema() {
    try {
      const schemaPath = path.join(__dirname, '../schema/prompt-schema.json');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      return JSON.parse(schemaContent);
    } catch (error) {
      console.error('❌ Failed to load prompt schema:', error.message);
      process.exit(1);
    }
  }

  /**
   * Load the prompt configuration
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
   * Validate a single prompt file
   */
  async validatePromptFile(filePath) {
    const results = {
      file: filePath,
      valid: false,
      errors: [],
      warnings: [],
      metrics: {}
    };

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        results.errors.push(`File not found: ${filePath}`);
        return results;
      }

      // Read and parse YAML
      const content = fs.readFileSync(filePath, 'utf8');
      let promptData;
      
      try {
        promptData = yaml.load(content);
      } catch (yamlError) {
        results.errors.push(`Invalid YAML syntax: ${yamlError.message}`);
        return results;
      }

      // Validate against schema
      const isValid = this.validate(promptData);
      
      if (!isValid) {
        results.errors.push(...this.validate.errors.map(err => 
          `${err.instancePath || 'root'}: ${err.message}`
        ));
      }

      // Custom validations
      this.performCustomValidations(promptData, results);

      // Calculate metrics
      results.metrics = this.calculateMetrics(promptData, content);

      // Determine overall validity
      results.valid = results.errors.length === 0;

    } catch (error) {
      results.errors.push(`Validation error: ${error.message}`);
    }

    return results;
  }

  /**
   * Perform custom validation checks
   */
  performCustomValidations(promptData, results) {
    // Check for required categories
    if (promptData.category && !this.config.categories[promptData.category]) {
      results.warnings.push(`Unknown category: ${promptData.category}`);
    }

    // Check model availability
    if (promptData.model && !this.isModelSupported(promptData.model)) {
      results.warnings.push(`Model may not be supported: ${promptData.model}`);
    }

    // Check message content for variables
    if (promptData.messages) {
      const variables = this.extractVariables(promptData.messages);
      const declaredVars = Object.keys(promptData.variables || {});
      
      // Check for undeclared variables
      variables.forEach(variable => {
        if (!declaredVars.includes(variable)) {
          results.warnings.push(`Undeclared variable used: {{${variable}}}`);
        }
      });

      // Check for unused declared variables
      declaredVars.forEach(variable => {
        if (!variables.includes(variable)) {
          results.warnings.push(`Declared variable not used: ${variable}`);
        }
      });
    }

    // Check test data completeness
    if (promptData.testData && promptData.variables) {
      promptData.testData.forEach((testCase, index) => {
        const requiredVars = Object.keys(promptData.variables).filter(
          key => promptData.variables[key].required
        );
        
        requiredVars.forEach(variable => {
          if (!(variable in (testCase.variables || {}))) {
            results.warnings.push(
              `Test case ${index + 1} missing required variable: ${variable}`
            );
          }
        });
      });
    }

    // Check for security issues
    this.checkSecurity(promptData, results);
  }

  /**
   * Check for security issues in prompts
   */
  checkSecurity(promptData, results) {
    const securityPatterns = [
      { pattern: /\beval\b/gi, message: 'Potential code injection risk with eval()' },
      { pattern: /\bexec\b/gi, message: 'Potential command injection risk with exec()' },
      { pattern: /\$\{[^}]+\}/g, message: 'Template literal that could be dangerous' },
      { pattern: /\b(password|secret|token|key)\b/gi, message: 'Potential credential exposure' }
    ];

    const allContent = JSON.stringify(promptData);
    
    securityPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(allContent)) {
        results.warnings.push(`Security: ${message}`);
      }
    });
  }

  /**
   * Extract variables from message content
   */
  extractVariables(messages) {
    const variables = new Set();
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    messages.forEach(message => {
      if (message.content) {
        let match;
        while ((match = variablePattern.exec(message.content)) !== null) {
          variables.add(match[1].trim());
        }
      }
    });
    
    return Array.from(variables);
  }

  /**
   * Check if a model is supported
   */
  isModelSupported(model) {
    const supportedModels = this.schema.properties.model.enum;
    return supportedModels.includes(model);
  }

  /**
   * Calculate metrics for the prompt
   */
  calculateMetrics(promptData, content) {
    const metrics = {
      file_size: Buffer.byteLength(content, 'utf8'),
      line_count: content.split('\n').length,
      message_count: promptData.messages ? promptData.messages.length : 0,
      variable_count: promptData.variables ? Object.keys(promptData.variables).length : 0,
      test_case_count: promptData.testData ? promptData.testData.length : 0,
      evaluator_count: promptData.evaluators ? promptData.evaluators.length : 0
    };

    // Calculate estimated token count (rough approximation)
    if (promptData.messages) {
      const totalContent = promptData.messages
        .map(msg => msg.content || '')
        .join(' ');
      metrics.estimated_tokens = Math.ceil(totalContent.split(' ').length * 1.3);
    }

    return metrics;
  }

  /**
   * Validate all prompt files in a directory
   */
  async validateDirectory(dirPath, options = {}) {
    const { recursive = true, pattern = /\.ya?ml$/ } = options;
    const results = [];

    const validateFiles = async (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && recursive) {
          await validateFiles(fullPath);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          const result = await this.validatePromptFile(fullPath);
          results.push(result);
        }
      }
    };

    await validateFiles(dirPath);
    return results;
  }

  /**
   * Generate a validation report
   */
  generateReport(results, options = {}) {
    const { format = 'text', output = null } = options;
    
    let report;
    
    if (format === 'json') {
      report = JSON.stringify({
        summary: this.generateSummary(results),
        results: results
      }, null, 2);
    } else {
      report = this.generateTextReport(results);
    }

    if (output) {
      fs.writeFileSync(output, report);
      console.log(`📄 Report saved to: ${output}`);
    } else {
      console.log(report);
    }

    return report;
  }

  /**
   * Generate a summary of validation results
   */
  generateSummary(results) {
    const summary = {
      total_files: results.length,
      valid_files: results.filter(r => r.valid).length,
      invalid_files: results.filter(r => !r.valid).length,
      total_errors: results.reduce((sum, r) => sum + r.errors.length, 0),
      total_warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
      categories: {}
    };

    // Count by validation status
    summary.validation_rate = summary.total_files > 0 
      ? (summary.valid_files / summary.total_files * 100).toFixed(1) + '%'
      : '0%';

    return summary;
  }

  /**
   * Generate a text report
   */
  generateTextReport(results) {
    const summary = this.generateSummary(results);
    
    let report = `
📊 EchoTune AI Prompt Validation Report
======================================

📈 Summary:
  Total Files: ${summary.total_files}
  ✅ Valid Files: ${summary.valid_files}
  ❌ Invalid Files: ${summary.invalid_files}
  📊 Validation Rate: ${summary.validation_rate}
  🚨 Total Errors: ${summary.total_errors}
  ⚠️  Total Warnings: ${summary.total_warnings}

`;

    // Group results by status
    const validFiles = results.filter(r => r.valid);
    const invalidFiles = results.filter(r => !r.valid);

    if (validFiles.length > 0) {
      report += `\n✅ Valid Files (${validFiles.length}):\n`;
      validFiles.forEach(result => {
        report += `  ✓ ${path.basename(result.file)}\n`;
        if (result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            report += `    ⚠️  ${warning}\n`;
          });
        }
      });
    }

    if (invalidFiles.length > 0) {
      report += `\n❌ Invalid Files (${invalidFiles.length}):\n`;
      invalidFiles.forEach(result => {
        report += `  ✗ ${path.basename(result.file)}\n`;
        result.errors.forEach(error => {
          report += `    ❌ ${error}\n`;
        });
        if (result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            report += `    ⚠️  ${warning}\n`;
          });
        }
      });
    }

    return report;
  }

  /**
   * Auto-fix common issues in prompt files
   */
  async autoFix(filePath, options = {}) {
    const { backup = true, dryRun = false } = options;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let fixedContent = content;
      const fixes = [];

      // Normalize whitespace
      if (this.config.validation?.auto_fix?.fixes?.includes('normalize_whitespace')) {
        fixedContent = fixedContent.replace(/\s+$/gm, ''); // Remove trailing whitespace
        fixedContent = fixedContent.replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
        fixes.push('Normalized whitespace');
      }

      // Add required fields if missing
      try {
        const promptData = yaml.load(fixedContent);
        let modified = false;

        if (!promptData.version) {
          promptData.version = '1.0.0';
          modified = true;
          fixes.push('Added default version');
        }

        if (!promptData.category) {
          promptData.category = 'coding-agent';
          modified = true;
          fixes.push('Added default category');
        }

        if (modified) {
          fixedContent = yaml.dump(promptData, { 
            indent: 2, 
            lineWidth: 100,
            noRefs: true 
          });
        }
      } catch (yamlError) {
        // If YAML is invalid, we can't auto-fix structure
      }

      // Apply fixes if not dry run
      if (!dryRun && fixes.length > 0) {
        if (backup) {
          fs.writeFileSync(`${filePath}.backup`, content);
        }
        fs.writeFileSync(filePath, fixedContent);
      }

      return {
        file: filePath,
        fixes: fixes,
        dry_run: dryRun,
        backup_created: backup && fixes.length > 0
      };

    } catch (error) {
      return {
        file: filePath,
        error: error.message,
        fixes: []
      };
    }
  }
}

// CLI interface
if (require.main === module) {
  const validator = new PromptValidator();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'validate':
      const target = args[1] || path.join(__dirname, '../catalog');
      const format = args.includes('--json') ? 'json' : 'text';
      const output = args[args.indexOf('--output') + 1] || null;
      
      if (fs.statSync(target).isDirectory()) {
        validator.validateDirectory(target).then(results => {
          validator.generateReport(results, { format, output });
          process.exit(results.some(r => !r.valid) ? 1 : 0);
        });
      } else {
        validator.validatePromptFile(target).then(result => {
          validator.generateReport([result], { format, output });
          process.exit(result.valid ? 0 : 1);
        });
      }
      break;
      
    case 'fix':
      const fileToFix = args[1];
      const dryRun = args.includes('--dry-run');
      const noBackup = args.includes('--no-backup');
      
      if (!fileToFix) {
        console.error('❌ Please specify a file to fix');
        process.exit(1);
      }
      
      validator.autoFix(fileToFix, { 
        backup: !noBackup, 
        dryRun 
      }).then(result => {
        console.log(`🔧 Auto-fix results for ${result.file}:`);
        if (result.error) {
          console.log(`❌ Error: ${result.error}`);
        } else if (result.fixes.length > 0) {
          result.fixes.forEach(fix => console.log(`  ✓ ${fix}`));
          if (result.dry_run) {
            console.log('  (Dry run - no changes applied)');
          }
        } else {
          console.log('  ✓ No fixes needed');
        }
      });
      break;
      
    default:
      console.log(`
🛠️  EchoTune AI Prompt Validator

Usage:
  node validator.js validate [path] [--json] [--output file]
    Validate prompt files (default: ../catalog)
    
  node validator.js fix <file> [--dry-run] [--no-backup]
    Auto-fix common issues in a prompt file

Examples:
  node validator.js validate
  node validator.js validate ../catalog/coding-agent --json
  node validator.js fix ../catalog/coding-agent/code-review.yml
  node validator.js fix ../catalog/coding-agent/code-review.yml --dry-run
      `);
  }
}

module.exports = PromptValidator;