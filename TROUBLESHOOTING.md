# EchoTune AI - Troubleshooting Guide

This guide helps resolve common issues with EchoTune AI, including MCP tools, workflows, and system integration.

## 🚨 Common Issues

### MCP Tools Issues

#### Enhanced File Utilities Not Working
**Symptoms**: File operations fail with security violations or permission errors

**Solutions**:
1. **Check allowed directories**:
   ```bash
   node mcp-servers/enhanced-file-utilities.js health
   ```
   
2. **Verify file permissions**:
   ```bash
   ls -la package.json
   chmod 644 package.json  # If needed
   ```

3. **Update configuration**:
   ```javascript
   const fileMCP = new EnhancedFileMCP({
     allowedDirectories: [
       process.cwd(),
       path.join(process.cwd(), 'src'),
       path.join(process.cwd(), 'scripts')
     ]
   });
   ```

#### Browser Tools Failing
**Symptoms**: Puppeteer crashes, browser won't start, or navigation timeouts

**Solutions**:
1. **Install system dependencies**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y chromium-browser

   # Or install Puppeteer's Chromium
   npx puppeteer browsers install chrome
   ```

2. **Configure browser path**:
   ```bash
   export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   export PUPPETEER_HEADLESS=true
   ```

3. **Test browser tools**:
   ```bash
   node mcp-servers/enhanced-browser-tools.js health
   ```

#### Comprehensive Validator Errors
**Symptoms**: System validation fails or reports critical issues

**Solutions**:
1. **Check system resources**:
   ```bash
   node mcp-servers/comprehensive-validator.js system
   ```

2. **Fix security issues**:
   ```bash
   # Fix file permissions
   chmod 600 api_keys.env
   chmod 644 .env.example
   ```

3. **Set required environment variables**:
   ```bash
   export NODE_ENV=development
   export DEFAULT_LLM_PROVIDER=mock
   ```

### Workflow Issues

#### GitHub Actions Failing
**Symptoms**: Workflows timeout, fail to start, or have dependency issues

**Solutions**:
1. **Check workflow syntax**:
   ```bash
   npm run workflow:analyze
   ```

2. **Optimize workflows**:
   ```bash
   npm run workflow:optimize
   ```

3. **Apply optimizations**:
   ```bash
   npm run workflow:optimize:apply
   ```

#### Cache Issues
**Symptoms**: Slow CI runs, repeated dependency downloads

**Solutions**:
1. **Clear npm cache**:
   ```bash
   npm cache clean --force
   ```

2. **Update cache keys** in workflows:
   ```yaml
   - uses: actions/cache@v4
     with:
       key: echotune-v2-deps-${{ hashFiles('package-lock.json') }}
   ```

### Application Issues

#### Linting Errors
**Symptoms**: ESLint reports errors preventing code quality checks

**Solutions**:
1. **Run automatic fixes**:
   ```bash
   npm run lint:fix
   ```

2. **Fix specific error types**:
   ```bash
   # React hooks dependencies
   # Add missing dependencies or use useCallback/useMemo
   
   # Unused variables
   # Prefix with underscore: _unusedVar
   
   # Character class issues
   # Use Unicode flag: /pattern/gu
   ```

#### Test Failures
**Symptoms**: Tests timeout, fail to start, or have import errors

**Solutions**:
1. **Check test environment**:
   ```bash
   npm test -- --verbose
   ```

2. **Fix common issues**:
   ```bash
   # Clear Jest cache
   npx jest --clearCache
   
   # Update test configuration
   npm run test:unit
   npm run test:integration
   ```

#### Database Connection Issues
**Symptoms**: MongoDB/Supabase connection failures

**Solutions**:
1. **Check connection strings**:
   ```bash
   # Test MongoDB connection
   node -e "
   const { MongoClient } = require('mongodb');
   MongoClient.connect(process.env.MONGODB_URI)
     .then(() => console.log('✅ MongoDB connected'))
     .catch(err => console.log('❌ MongoDB error:', err.message));
   "
   ```

2. **Use SQLite fallback**:
   ```bash
   # Remove MongoDB/Supabase config to use SQLite
   unset MONGODB_URI
   unset SUPABASE_URL
   ```

### Performance Issues

#### Slow MCP Operations
**Symptoms**: File operations or validations taking too long

**Solutions**:
1. **Check performance metrics**:
   ```bash
   node mcp-servers/enhanced-file-utilities.js performance
   ```

2. **Optimize operations**:
   ```javascript
   // Use batch operations for multiple files
   const operations = files.map(file => ({ type: 'read', path: file }));
   const results = await fileMCP.batchOperations(operations);
   ```

3. **Clear audit logs**:
   ```javascript
   // Audit logs are auto-trimmed, but you can check size
   const auditTrail = fileMCP.getAuditTrail(10);
   console.log('Recent operations:', auditTrail.length);
   ```

#### Memory Leaks
**Symptoms**: High memory usage, application crashes

**Solutions**:
1. **Enable garbage collection**:
   ```bash
   node --expose-gc mcp-servers/enhanced-file-utilities.js health
   ```

2. **Monitor memory usage**:
   ```bash
   node mcp-servers/comprehensive-validator.js health | jq '.validation.results.system.metrics.memory'
   ```

3. **Optimize batch sizes**:
   ```javascript
   // Process files in smaller batches
   const batchSize = 10;
   for (let i = 0; i < files.length; i += batchSize) {
     const batch = files.slice(i, i + batchSize);
     await processBatch(batch);
   }
   ```

## 🔧 Diagnostic Commands

### System Health Check
```bash
# Comprehensive system validation
node mcp-servers/comprehensive-validator.js health

# Quick health check
npm run health-check

# MCP servers status
npm run mcp-health
```

### Performance Diagnostics
```bash
# MCP integration test with performance metrics
node mcp-servers/mcp-integration-tester.js

# File utilities performance
node mcp-servers/enhanced-file-utilities.js performance

# Browser tools performance
node mcp-servers/enhanced-browser-tools.js performance
```

### Workflow Analysis
```bash
# Analyze workflow efficiency
npm run workflow:analyze

# Generate optimization report
npm run workflow:report

# Check workflow status
npm run workflow:status
```

## 🐛 Debug Mode

### Enable Debug Logging
```bash
export DEBUG=true
export LOG_LEVEL=DEBUG
export NODE_ENV=development
```

### Verbose Testing
```bash
# Run tests with detailed output
npm test -- --verbose --detectOpenHandles

# Run specific test files
npm test tests/integration/enhanced-mcp-tools.test.js

# Run performance tests
npm test tests/performance/mcp-performance.test.js
```

### MCP Debug Mode
```javascript
// Enable debug mode in MCP tools
const fileMCP = new EnhancedFileMCP();
const debugInfo = {
  allowedDirectories: fileMCP.allowedDirectories,
  allowedExtensions: fileMCP.allowedExtensions,
  operationLog: fileMCP.getAuditTrail(5)
};
console.log('Debug info:', debugInfo);
```

## 🔍 Log Analysis

### Application Logs
```bash
# Check for errors in application logs
grep -i error logs/app.log

# Monitor real-time logs
tail -f logs/app.log
```

### MCP Operation Logs
```bash
# View recent MCP operations
node mcp-servers/enhanced-file-utilities.js audit 20

# Check for failed operations
node -e "
const { EnhancedFileMCP } = require('./mcp-servers/enhanced-file-utilities');
const fileMCP = new EnhancedFileMCP();
const failed = fileMCP.getAuditTrail(100).filter(op => !op.success);
console.log('Failed operations:', failed);
"
```

### Workflow Logs
```bash
# Check GitHub Actions logs locally
gh run list --limit 5
gh run view [run-id] --log
```

## 📞 Getting Additional Help

### Generate Support Information
```bash
# Create comprehensive diagnostic report
cat > support-info.txt << EOF
# EchoTune AI Support Information
Generated: $(date)

## System Information
Node Version: $(node --version)
NPM Version: $(npm --version)
OS: $(uname -a)

## Application Status
$(npm run health-check 2>&1)

## MCP Status
$(npm run mcp-health 2>&1)

## Recent Errors
$(npm test 2>&1 | tail -20)

## Package Info
$(cat package.json | jq '{name, version, dependencies: (.dependencies | keys | length), scripts: (.scripts | keys | length)}')
EOF

echo "Support information saved to support-info.txt"
```

### Performance Report
```bash
# Generate performance report
node mcp-servers/mcp-integration-tester.js > performance-report.txt 2>&1
echo "Performance report saved to performance-report.txt"
```

### Security Audit
```bash
# Run security audit
npm audit --audit-level moderate > security-audit.txt 2>&1
node mcp-servers/comprehensive-validator.js system | jq '.results.security' > security-report.json
echo "Security reports generated"
```

## ⚡ Quick Fixes

### Reset to Clean State
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Reset MCP servers
npm run mcp-install

# Clear caches
npm cache clean --force
npx jest --clearCache
```

### Emergency Recovery
```bash
# Restore from backup
git stash push -m "emergency-backup"
git reset --hard HEAD~1

# Or restore specific files
git checkout HEAD -- package.json
git checkout HEAD -- .github/workflows/
```

### Minimal Working Configuration
```bash
# Set minimal environment
export NODE_ENV=development
export DEFAULT_LLM_PROVIDER=mock
export LOG_LEVEL=INFO

# Test basic functionality
npm start &
sleep 5
curl -f http://localhost:3000/health
kill %1
```

---

For additional support, please check:
- [GitHub Issues](https://github.com/dzp5103/Spotify-echo/issues)
- [Project Documentation](./README.md)
- [MCP Integration Guide](./MCP_INTEGRATION_SUMMARY.md)