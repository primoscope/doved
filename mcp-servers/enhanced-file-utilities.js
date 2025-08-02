#!/usr/bin/env node

/**
 * Enhanced FileMCP Utilities for EchoTune AI
 * Provides improved file handling, validation, and security
 * Implements comprehensive error checking and performance monitoring
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class EnhancedFileMCP {
  constructor(options = {}) {
    this.allowedDirectories = options.allowedDirectories || [
      process.cwd(),
      path.join(process.cwd(), 'src'),
      path.join(process.cwd(), 'scripts'),
      path.join(process.cwd(), 'mcp-server'),
      path.join(process.cwd(), 'tests'),
      path.join(process.cwd(), 'docs')
    ];
    
    this.allowedExtensions = options.allowedExtensions || [
      '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.yml', '.yaml',
      '.py', '.sh', '.css', '.html', '.env'
    ];
    
    this.operationLog = [];
    this.performanceMetrics = new Map();
    this.validationRules = new Map();
    
    this.initializeValidationRules();
  }

  initializeValidationRules() {
    // File size limits
    this.validationRules.set('maxFileSize', 10 * 1024 * 1024); // 10MB
    this.validationRules.set('maxOperationsPerMinute', 100);
    this.validationRules.set('maxAuditLogSize', 1000);
    
    // Security patterns to detect
    this.validationRules.set('dangerousPatterns', [
      /eval\s*\(/,
      /Function\s*\(/,
      /process\.exit\s*\(/,
      /require\s*\(\s*['"]child_process['"]/,
      /rm\s+-rf\s+/,
      /sudo\s+/
    ]);
  }

  /**
   * Validate file path security
   */
  validatePath(filePath) {
    const resolvedPath = path.resolve(filePath);
    
    // Check if path is within allowed directories
    const isAllowed = this.allowedDirectories.some(allowedDir => {
      const resolvedAllowed = path.resolve(allowedDir);
      return resolvedPath.startsWith(resolvedAllowed);
    });
    
    if (!isAllowed) {
      throw new Error(`Security violation: Path outside allowed directories: ${resolvedPath}`);
    }

    // Check file extension only for files with extensions
    const ext = path.extname(resolvedPath);
    if (ext && this.allowedExtensions.length > 0 && !this.allowedExtensions.includes(ext)) {
      throw new Error(`Security violation: File extension not allowed: ${ext}`);
    }

    // Check for path traversal attacks
    if (resolvedPath.includes('..') || resolvedPath.includes('./')) {
      throw new Error(`Security violation: Path traversal detected: ${filePath}`);
    }

    return resolvedPath;
  }

  /**
   * Validate file content for security issues
   */
  validateContent(content, operation) {
    const dangerousPatterns = this.validationRules.get('dangerousPatterns');
    const maxSize = this.validationRules.get('maxFileSize');
    
    // Check file size
    if (content.length > maxSize) {
      throw new Error(`Validation error: File size exceeds limit (${maxSize} bytes)`);
    }

    // Check for dangerous patterns in write operations
    if (operation === 'write' || operation === 'create') {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          throw new Error(`Security violation: Dangerous pattern detected: ${pattern.source}`);
        }
      }
    }

    return true;
  }

  /**
   * Enhanced file reading with validation and monitoring
   */
  async readFile(filePath, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      const validatedPath = this.validatePath(filePath);
      
      // Check if file exists
      await fs.access(validatedPath);
      
      // Get file stats for validation
      const stats = await fs.stat(validatedPath);
      if (stats.size > this.validationRules.get('maxFileSize')) {
        throw new Error(`File too large: ${stats.size} bytes`);
      }
      
      const content = await fs.readFile(validatedPath, options.encoding || 'utf8');
      const endTime = Date.now();
      
      const result = {
        success: true,
        content,
        metadata: {
          path: validatedPath,
          size: content.length,
          encoding: options.encoding || 'utf8',
          timestamp: new Date().toISOString(),
          operationId,
          performanceMs: endTime - startTime
        }
      };
      
      this.logOperation('read', filePath, true, result.metadata);
      this.recordPerformance('read', endTime - startTime);
      
      return result;
      
    } catch (error) {
      const endTime = Date.now();
      this.logOperation('read', filePath, false, {
        error: error.message,
        operationId,
        performanceMs: endTime - startTime
      });
      throw error;
    }
  }

  /**
   * Enhanced file writing with comprehensive validation
   */
  async writeFile(filePath, content, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      const validatedPath = this.validatePath(filePath);
      
      // Validate content
      this.validateContent(content, 'write');
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(validatedPath), { recursive: true });
      
      // Create backup if file exists and backup is requested
      if (options.createBackup && await this.fileExists(validatedPath)) {
        const backupPath = `${validatedPath}.backup.${Date.now()}`;
        await fs.copyFile(validatedPath, backupPath);
      }
      
      await fs.writeFile(validatedPath, content, {
        encoding: options.encoding || 'utf8',
        mode: options.mode || 0o644
      });
      
      const endTime = Date.now();
      
      const result = {
        success: true,
        path: validatedPath,
        size: content.length,
        metadata: {
          timestamp: new Date().toISOString(),
          operationId,
          performanceMs: endTime - startTime,
          backupCreated: options.createBackup && await this.fileExists(`${validatedPath}.backup.${Date.now() - 1000}`)
        }
      };
      
      this.logOperation('write', filePath, true, result.metadata);
      this.recordPerformance('write', endTime - startTime);
      
      return result;
      
    } catch (error) {
      const endTime = Date.now();
      this.logOperation('write', filePath, false, {
        error: error.message,
        operationId,
        performanceMs: endTime - startTime
      });
      throw error;
    }
  }

  /**
   * Enhanced directory listing with metadata
   */
  async listDirectory(dirPath, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      const validatedPath = this.validatePath(dirPath);
      const items = await fs.readdir(validatedPath, { withFileTypes: true });
      
      const result = [];
      for (const item of items) {
        const itemPath = path.join(validatedPath, item.name);
        const stats = await fs.stat(itemPath).catch(() => null);
        
        result.push({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          path: itemPath,
          size: stats ? stats.size : 0,
          modified: stats ? stats.mtime.toISOString() : null,
          extension: item.isFile() ? path.extname(item.name) : null
        });
      }
      
      const endTime = Date.now();
      
      const response = {
        success: true,
        items: result,
        metadata: {
          path: validatedPath,
          itemCount: result.length,
          timestamp: new Date().toISOString(),
          operationId,
          performanceMs: endTime - startTime
        }
      };
      
      this.logOperation('list', dirPath, true, response.metadata);
      this.recordPerformance('list', endTime - startTime);
      
      return response;
      
    } catch (error) {
      const endTime = Date.now();
      this.logOperation('list', dirPath, false, {
        error: error.message,
        operationId,
        performanceMs: endTime - startTime
      });
      throw error;
    }
  }

  /**
   * File validation and analysis
   */
  async validateFile(filePath) {
    const startTime = Date.now();
    
    try {
      const validatedPath = this.validatePath(filePath);
      const stats = await fs.stat(validatedPath);
      const content = await fs.readFile(validatedPath, 'utf8');
      
      const analysis = {
        path: validatedPath,
        size: stats.size,
        lines: content.split('\n').length,
        encoding: 'utf8',
        extension: path.extname(validatedPath),
        isValid: true,
        securityIssues: [],
        performance: Date.now() - startTime
      };
      
      // Check for security issues
      const dangerousPatterns = this.validationRules.get('dangerousPatterns');
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          analysis.securityIssues.push({
            pattern: pattern.source,
            type: 'dangerous_code',
            severity: 'high'
          });
        }
      }
      
      analysis.isValid = analysis.securityIssues.length === 0;
      
      this.logOperation('validate', filePath, true, {
        issues: analysis.securityIssues.length,
        performance: analysis.performance
      });
      
      return analysis;
      
    } catch (error) {
      this.logOperation('validate', filePath, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Batch file operations with rollback capability
   */
  async batchOperations(operations) {
    const batchId = this.generateOperationId();
    const results = [];
    const rollbackOperations = [];
    
    try {
      for (const operation of operations) {
        const { type, path: filePath, content, options = {} } = operation;
        
        let result;
        switch (type) {
          case 'read':
            result = await this.readFile(filePath, options);
            break;
          case 'write':
            // Create backup for rollback
            if (await this.fileExists(filePath)) {
              const backupContent = await fs.readFile(filePath, 'utf8');
              rollbackOperations.push({
                type: 'write',
                path: filePath,
                content: backupContent
              });
            } else {
              rollbackOperations.push({
                type: 'delete',
                path: filePath
              });
            }
            result = await this.writeFile(filePath, content, options);
            break;
          case 'list':
            result = await this.listDirectory(filePath, options);
            break;
          default:
            throw new Error(`Unknown operation type: ${type}`);
        }
        
        results.push({ operation, result });
      }
      
      this.logOperation('batch', `${operations.length} operations`, true, {
        batchId,
        operationCount: operations.length
      });
      
      return {
        success: true,
        results,
        batchId,
        rollbackAvailable: rollbackOperations.length > 0
      };
      
    } catch (error) {
      // Attempt rollback
      if (rollbackOperations.length > 0) {
        try {
          for (const rollback of rollbackOperations.reverse()) {
            if (rollback.type === 'write') {
              await fs.writeFile(rollback.path, rollback.content);
            } else if (rollback.type === 'delete') {
              await fs.unlink(rollback.path);
            }
          }
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError.message);
        }
      }
      
      this.logOperation('batch', `${operations.length} operations`, false, {
        batchId,
        error: error.message,
        rollbackAttempted: rollbackOperations.length > 0
      });
      
      throw error;
    }
  }

  /**
   * Utility methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  generateOperationId() {
    return crypto.randomBytes(8).toString('hex');
  }

  logOperation(operation, path, success, details = {}) {
    const logEntry = {
      id: this.generateOperationId(),
      timestamp: new Date().toISOString(),
      operation,
      path,
      success,
      details
    };
    
    this.operationLog.push(logEntry);
    
    // Keep only recent operations
    const maxLogs = this.validationRules.get('maxAuditLogSize');
    if (this.operationLog.length > maxLogs) {
      this.operationLog = this.operationLog.slice(-maxLogs);
    }
    
    console.log(`📁 FileMCP ${success ? '✅' : '❌'}: ${operation} on ${path}`);
    return logEntry;
  }

  recordPerformance(operation, durationMs) {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    
    const metrics = this.performanceMetrics.get(operation);
    metrics.push(durationMs);
    
    // Keep only recent 100 measurements
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics() {
    const analytics = {};
    
    for (const [operation, measurements] of this.performanceMetrics) {
      if (measurements.length > 0) {
        const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        const min = Math.min(...measurements);
        const max = Math.max(...measurements);
        
        analytics[operation] = {
          averageMs: Math.round(avg * 100) / 100,
          minMs: min,
          maxMs: max,
          count: measurements.length
        };
      }
    }
    
    return analytics;
  }

  /**
   * Get audit trail
   */
  getAuditTrail(limit = 50) {
    return this.operationLog
      .slice(-limit)
      .reverse();
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testPath = path.join(process.cwd(), 'package.json');
      await this.readFile(testPath);
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: this.getPerformanceAnalytics(),
        recentOperations: this.operationLog.length,
        allowedDirectories: this.allowedDirectories.length,
        allowedExtensions: this.allowedExtensions.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = { EnhancedFileMCP };

// CLI usage
if (require.main === module) {
  const fileMCP = new EnhancedFileMCP();
  
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  async function runCommand() {
    try {
      switch (command) {
        case 'health':
          const health = await fileMCP.healthCheck();
          console.log(JSON.stringify(health, null, 2));
          break;
        case 'read':
          if (!args[0]) throw new Error('Path required');
          const content = await fileMCP.readFile(args[0]);
          console.log(JSON.stringify(content, null, 2));
          break;
        case 'list':
          if (!args[0]) throw new Error('Directory path required');
          const listing = await fileMCP.listDirectory(args[0]);
          console.log(JSON.stringify(listing, null, 2));
          break;
        case 'validate':
          if (!args[0]) throw new Error('File path required');
          const validation = await fileMCP.validateFile(args[0]);
          console.log(JSON.stringify(validation, null, 2));
          break;
        case 'audit':
          const audit = fileMCP.getAuditTrail(parseInt(args[0]) || 20);
          console.log(JSON.stringify(audit, null, 2));
          break;
        case 'performance':
          const perf = fileMCP.getPerformanceAnalytics();
          console.log(JSON.stringify(perf, null, 2));
          break;
        default:
          console.log('Available commands: health, read, list, validate, audit, performance');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
  
  runCommand();
}