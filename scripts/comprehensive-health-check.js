#!/usr/bin/env node

/**
 * EchoTune AI - Comprehensive Health Check Script
 * Validates all system components and provides detailed diagnostics
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Colors for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

// Logging functions
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    header: (msg) => console.log(`\n${colors.cyan}=== ${msg} ===${colors.reset}`)
};

// Health check results
const results = {
    environment: { status: 'unknown', details: [] },
    dependencies: { status: 'unknown', details: [] },
    configuration: { status: 'unknown', details: [] },
    database: { status: 'unknown', details: [] },
    services: { status: 'unknown', details: [] },
    mcp: { status: 'unknown', details: [] },
    security: { status: 'unknown', details: [] }
};

// Utility functions
const execCommand = (command, args = []) => {
    return new Promise((resolve) => {
        const process = spawn(command, args, { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            process.kill();
            resolve({ code: -1, stdout, stderr: 'Command timeout' });
        }, 10000);
    });
};

const checkPort = (port) => {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/health',
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ success: true, data: parsed, status: res.statusCode });
                } catch (e) {
                    resolve({ success: true, data: data, status: res.statusCode });
                }
            });
        });
        
        req.on('error', () => resolve({ success: false }));
        req.on('timeout', () => resolve({ success: false }));
        req.end();
    });
};

// Health check functions
const checkEnvironment = async () => {
    log.header('Environment Check');
    
    const checks = [];
    
    // Node.js version
    try {
        const nodeVersion = process.version;
        const major = parseInt(nodeVersion.split('.')[0].substring(1));
        if (major >= 18) {
            checks.push({ name: 'Node.js Version', status: 'healthy', detail: nodeVersion });
        } else {
            checks.push({ name: 'Node.js Version', status: 'warning', detail: `${nodeVersion} (recommend 18+)` });
        }
    } catch (e) {
        checks.push({ name: 'Node.js Version', status: 'error', detail: 'Unable to determine version' });
    }
    
    // npm version
    const npmResult = await execCommand('npm', ['--version']);
    if (npmResult.code === 0) {
        checks.push({ name: 'npm Version', status: 'healthy', detail: npmResult.stdout.trim() });
    } else {
        checks.push({ name: 'npm Version', status: 'error', detail: 'npm not found' });
    }
    
    // Python version
    const pythonResult = await execCommand('python3', ['--version']);
    if (pythonResult.code === 0) {
        checks.push({ name: 'Python Version', status: 'healthy', detail: pythonResult.stdout.trim() });
    } else {
        checks.push({ name: 'Python Version', status: 'warning', detail: 'python3 not found' });
    }
    
    // Operating System
    checks.push({ 
        name: 'Operating System', 
        status: 'healthy', 
        detail: `${process.platform} ${process.arch}` 
    });
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.rss / 1024 / 1024);
    checks.push({ 
        name: 'Memory Usage', 
        status: memMB < 1000 ? 'healthy' : 'warning', 
        detail: `${memMB}MB RSS` 
    });
    
    results.environment.details = checks;
    results.environment.status = checks.every(c => c.status === 'healthy') ? 'healthy' : 
                                 checks.some(c => c.status === 'error') ? 'error' : 'warning';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

const checkDependencies = async () => {
    log.header('Dependencies Check');
    
    const checks = [];
    
    // Check if package.json exists
    if (fs.existsSync('package.json')) {
        checks.push({ name: 'package.json', status: 'healthy', detail: 'Found' });
        
        // Check node_modules
        if (fs.existsSync('node_modules')) {
            checks.push({ name: 'node_modules', status: 'healthy', detail: 'Installed' });
        } else {
            checks.push({ name: 'node_modules', status: 'error', detail: 'Missing - run npm install' });
        }
    } else {
        checks.push({ name: 'package.json', status: 'error', detail: 'Not found' });
    }
    
    // Check Python requirements
    if (fs.existsSync('requirements.txt')) {
        checks.push({ name: 'requirements.txt', status: 'healthy', detail: 'Found' });
        
        // Check if venv exists
        if (fs.existsSync('venv')) {
            checks.push({ name: 'Python venv', status: 'healthy', detail: 'Available' });
        } else {
            checks.push({ name: 'Python venv', status: 'warning', detail: 'Not found - consider creating one' });
        }
    } else {
        checks.push({ name: 'requirements.txt', status: 'warning', detail: 'Not found' });
    }
    
    // Check critical dependencies
    const criticalDeps = ['express', 'socket.io', 'mongodb'];
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        criticalDeps.forEach(dep => {
            if (allDeps[dep]) {
                checks.push({ name: `Dependency: ${dep}`, status: 'healthy', detail: allDeps[dep] });
            } else {
                checks.push({ name: `Dependency: ${dep}`, status: 'warning', detail: 'Not found' });
            }
        });
    } catch (e) {
        checks.push({ name: 'Dependency analysis', status: 'error', detail: 'Unable to parse package.json' });
    }
    
    results.dependencies.details = checks;
    results.dependencies.status = checks.every(c => c.status === 'healthy') ? 'healthy' : 
                                 checks.some(c => c.status === 'error') ? 'error' : 'warning';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

const checkConfiguration = async () => {
    log.header('Configuration Check');
    
    const checks = [];
    
    // Check .env file
    if (fs.existsSync('.env')) {
        checks.push({ name: '.env file', status: 'healthy', detail: 'Found' });
        
        // Load environment variables
        try {
            require('dotenv').config();
            
            // Check critical environment variables
            const envVars = [
                { name: 'NODE_ENV', required: false },
                { name: 'PORT', required: false },
                { name: 'SPOTIFY_CLIENT_ID', required: false },
                { name: 'MONGODB_URI', required: false }
            ];
            
            envVars.forEach(envVar => {
                const value = process.env[envVar.name];
                if (value) {
                    const displayValue = envVar.name.includes('SECRET') || envVar.name.includes('KEY') ? 
                        '***' : value.substring(0, 20) + (value.length > 20 ? '...' : '');
                    checks.push({ 
                        name: `ENV: ${envVar.name}`, 
                        status: 'healthy', 
                        detail: displayValue 
                    });
                } else if (envVar.required) {
                    checks.push({ 
                        name: `ENV: ${envVar.name}`, 
                        status: 'error', 
                        detail: 'Required but missing' 
                    });
                } else {
                    checks.push({ 
                        name: `ENV: ${envVar.name}`, 
                        status: 'warning', 
                        detail: 'Not set (optional)' 
                    });
                }
            });
        } catch (e) {
            checks.push({ name: 'Environment loading', status: 'error', detail: e.message });
        }
    } else {
        checks.push({ name: '.env file', status: 'warning', detail: 'Not found - using defaults' });
    }
    
    // Check .env.example
    if (fs.existsSync('.env.example')) {
        checks.push({ name: '.env.example', status: 'healthy', detail: 'Available' });
    } else {
        checks.push({ name: '.env.example', status: 'warning', detail: 'Missing template' });
    }
    
    results.configuration.details = checks;
    results.configuration.status = checks.every(c => c.status === 'healthy') ? 'healthy' : 
                                  checks.some(c => c.status === 'error') ? 'error' : 'warning';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

const checkServices = async () => {
    log.header('Services Check');
    
    const checks = [];
    const port = process.env.PORT || 3000;
    
    // Check main application
    const appHealth = await checkPort(port);
    if (appHealth.success) {
        checks.push({ 
            name: `Main App (port ${port})`, 
            status: 'healthy', 
            detail: `HTTP ${appHealth.status}` 
        });
        
        // Check health endpoint data
        if (appHealth.data && typeof appHealth.data === 'object') {
            if (appHealth.data.status) {
                checks.push({ 
                    name: 'Health Endpoint', 
                    status: appHealth.data.status === 'healthy' ? 'healthy' : 'warning', 
                    detail: appHealth.data.status 
                });
            }
        }
    } else {
        checks.push({ 
            name: `Main App (port ${port})`, 
            status: 'error', 
            detail: 'Not running or unreachable' 
        });
    }
    
    // Check MCP server
    const mcpHealth = await checkPort(3001);
    if (mcpHealth.success) {
        checks.push({ 
            name: 'MCP Server (port 3001)', 
            status: 'healthy', 
            detail: `HTTP ${mcpHealth.status}` 
        });
    } else {
        checks.push({ 
            name: 'MCP Server (port 3001)', 
            status: 'warning', 
            detail: 'Not running (optional)' 
        });
    }
    
    results.services.details = checks;
    results.services.status = checks.some(c => c.name.includes('Main App') && c.status === 'healthy') ? 
                             checks.every(c => c.status === 'healthy') ? 'healthy' : 'warning' : 'error';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

const checkMCP = async () => {
    log.header('MCP Servers Check');
    
    const checks = [];
    
    // Check if MCP directory exists
    if (fs.existsSync('mcp-servers')) {
        checks.push({ name: 'MCP Directory', status: 'healthy', detail: 'Found' });
        
        // Check MCP configuration in package.json
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            if (packageJson.mcp && packageJson.mcp.servers) {
                const serverCount = Object.keys(packageJson.mcp.servers).length;
                checks.push({ 
                    name: 'MCP Configuration', 
                    status: 'healthy', 
                    detail: `${serverCount} servers configured` 
                });
            } else {
                checks.push({ name: 'MCP Configuration', status: 'warning', detail: 'No servers configured' });
            }
        } catch (e) {
            checks.push({ name: 'MCP Configuration', status: 'error', detail: 'Unable to parse config' });
        }
    } else {
        checks.push({ name: 'MCP Directory', status: 'warning', detail: 'Not found' });
    }
    
    // Test MCP health command
    const mcpHealthResult = await execCommand('npm', ['run', 'mcp:health']);
    if (mcpHealthResult.code === 0) {
        checks.push({ name: 'MCP Health Command', status: 'healthy', detail: 'Working' });
    } else {
        checks.push({ name: 'MCP Health Command', status: 'warning', detail: 'Failed or not available' });
    }
    
    results.mcp.details = checks;
    results.mcp.status = checks.length > 0 && checks.every(c => c.status === 'healthy') ? 'healthy' : 'warning';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

const checkSecurity = async () => {
    log.header('Security Check');
    
    const checks = [];
    
    // Check npm audit
    const auditResult = await execCommand('npm', ['audit', '--audit-level', 'high', '--json']);
    if (auditResult.code === 0) {
        try {
            const auditData = JSON.parse(auditResult.stdout);
            const vulnerabilities = auditData.metadata?.vulnerabilities || {};
            const total = Object.values(vulnerabilities).reduce((sum, count) => sum + count, 0);
            
            if (total === 0) {
                checks.push({ name: 'NPM Audit', status: 'healthy', detail: 'No high-severity vulnerabilities' });
            } else {
                checks.push({ name: 'NPM Audit', status: 'warning', detail: `${total} vulnerabilities found` });
            }
        } catch (e) {
            checks.push({ name: 'NPM Audit', status: 'warning', detail: 'Unable to parse audit results' });
        }
    } else {
        checks.push({ name: 'NPM Audit', status: 'warning', detail: 'Audit failed or vulnerabilities found' });
    }
    
    // Check for sensitive files
    const sensitiveFiles = ['.env', 'api_keys.env', 'secrets.json'];
    sensitiveFiles.forEach(file => {
        if (fs.existsSync(file)) {
            // Check if file is in .gitignore
            let gitignoreContent = '';
            if (fs.existsSync('.gitignore')) {
                gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
            }
            
            if (gitignoreContent.includes(file) || gitignoreContent.includes('*.env')) {
                checks.push({ 
                    name: `Sensitive file: ${file}`, 
                    status: 'healthy', 
                    detail: 'Excluded from git' 
                });
            } else {
                checks.push({ 
                    name: `Sensitive file: ${file}`, 
                    status: 'warning', 
                    detail: 'Should be in .gitignore' 
                });
            }
        }
    });
    
    results.security.details = checks;
    results.security.status = checks.every(c => c.status === 'healthy') ? 'healthy' : 'warning';
    
    // Display results
    checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
    });
};

// Generate summary report
const generateSummary = () => {
    log.header('Health Check Summary');
    
    const categories = Object.keys(results);
    const healthy = categories.filter(cat => results[cat].status === 'healthy').length;
    const warnings = categories.filter(cat => results[cat].status === 'warning').length;
    const errors = categories.filter(cat => results[cat].status === 'error').length;
    
    console.log(`\n📊 Overall Status:`);
    console.log(`   ✅ Healthy: ${healthy}/${categories.length} categories`);
    console.log(`   ⚠️  Warnings: ${warnings}/${categories.length} categories`);
    console.log(`   ❌ Errors: ${errors}/${categories.length} categories`);
    
    // Overall status
    let overallStatus = 'healthy';
    if (errors > 0) {
        overallStatus = 'critical';
    } else if (warnings > 0) {
        overallStatus = 'warning';
    }
    
    console.log(`\n🎯 Overall Status: ${overallStatus.toUpperCase()}`);
    
    // Recommendations
    console.log(`\n💡 Recommendations:`);
    
    categories.forEach(category => {
        const result = results[category];
        if (result.status === 'error') {
            console.log(`   ❌ Fix ${category} issues before production use`);
        } else if (result.status === 'warning') {
            console.log(`   ⚠️  Review ${category} warnings for optimization`);
        }
    });
    
    if (overallStatus === 'healthy') {
        console.log(`   🎉 System is ready for use!`);
    }
    
    // Next steps
    console.log(`\n🚀 Quick Commands:`);
    console.log(`   npm start                 # Start the application`);
    console.log(`   npm run dev               # Start with auto-reload`);
    console.log(`   npm run install:modern    # Run modern installation`);
    console.log(`   npm run health:full       # Run this health check again`);
    
    return overallStatus;
};

// Main execution
const main = async () => {
    console.log(`${colors.magenta}╔══════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.magenta}║        EchoTune AI Health Check          ║${colors.reset}`);
    console.log(`${colors.magenta}╚══════════════════════════════════════════╝${colors.reset}`);
    
    try {
        await checkEnvironment();
        await checkDependencies();
        await checkConfiguration();
        await checkServices();
        await checkMCP();
        await checkSecurity();
        
        const overallStatus = generateSummary();
        
        // Exit with appropriate code
        process.exit(overallStatus === 'critical' ? 1 : 0);
        
    } catch (error) {
        log.error(`Health check failed: ${error.message}`);
        process.exit(1);
    }
};

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, results };