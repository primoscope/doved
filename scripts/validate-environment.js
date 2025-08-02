#!/usr/bin/env node

/**
 * Environment Validation Script
 * Validates and sets up optimal environment configuration
 */

const fs = require('fs');
const path = require('path');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`)
};

// Fix .gitignore if needed
const fixGitignore = () => {
    log.info('Checking .gitignore configuration...');
    
    const gitignorePath = '.gitignore';
    let gitignoreContent = '';
    
    if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    const requiredEntries = [
        '# Environment files',
        '.env',
        '.env.local',
        '.env.development.local',
        '.env.test.local',
        '.env.production.local',
        'api_keys.env',
        '',
        '# Node modules',
        'node_modules/',
        '',
        '# Logs',
        '*.log',
        'logs/',
        '',
        '# Python',
        '__pycache__/',
        '*.pyc',
        'venv/',
        '.venv/',
        '',
        '# IDE',
        '.vscode/',
        '.idea/',
        '',
        '# OS',
        '.DS_Store',
        'Thumbs.db',
        '',
        '# Temporary files',
        'tmp/',
        'temp/',
        '*.tmp'
    ];
    
    let updated = false;
    
    requiredEntries.forEach(entry => {
        if (entry && !gitignoreContent.includes(entry)) {
            gitignoreContent += '\n' + entry;
            updated = true;
        }
    });
    
    if (updated) {
        fs.writeFileSync(gitignorePath, gitignoreContent);
        log.success('Updated .gitignore with security best practices');
    } else {
        log.info('.gitignore is properly configured');
    }
};

// Create optimized .env file
const createOptimizedEnv = () => {
    log.info('Setting up environment configuration...');
    
    if (fs.existsSync('.env')) {
        log.info('.env file already exists - skipping creation');
        return;
    }
    
    const envTemplate = `# ============================================================================
# EchoTune AI - Environment Configuration
# ============================================================================
# Copy this file to .env and configure with your values
# All settings are optional - demo mode works without API keys
# ============================================================================

# Application Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=INFO
DEBUG=true

# ============================================================================
# Spotify Integration (Optional - Required for full music features)
# ============================================================================
# Get credentials from: https://developer.spotify.com/dashboard/applications
# SPOTIFY_CLIENT_ID=your_spotify_client_id_here
# SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
# SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/callback

# ============================================================================
# AI/LLM Providers (Optional - Falls back to demo mode)
# ============================================================================

# Google Gemini (Recommended - Fast and efficient)
# Get API key from: https://aistudio.google.com/app/apikey
# GEMINI_API_KEY=your_gemini_api_key_here

# OpenAI (Alternative option)
# Get API key from: https://platform.openai.com/api-keys
# OPENAI_API_KEY=your_openai_api_key_here

# Azure OpenAI (Enterprise option)
# AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# OpenRouter (Multiple models access)
# Get API key from: https://openrouter.ai/
# OPENROUTER_API_KEY=your_openrouter_api_key_here

# Default LLM Provider (options: mock, openai, gemini, azure, openrouter)
DEFAULT_LLM_PROVIDER=mock
DEFAULT_LLM_MODEL=gpt-3.5-turbo

# ============================================================================
# Database Configuration (Optional - Falls back to SQLite)
# ============================================================================

# MongoDB (Recommended for production)
# Get connection string from: https://cloud.mongodb.com/
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/echotune
# MONGODB_DATABASE=echotune_ai

# Supabase (Alternative option)
# Get credentials from: https://supabase.com/dashboard
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_supabase_anon_key_here
# DATABASE_URL=postgresql://username:password@db.your-project.supabase.co:5432/postgres

# ============================================================================
# Optional Features
# ============================================================================

# MCP Server Configuration
MCP_SERVER_PORT=3001

# Security & Performance
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session Configuration
SESSION_SECRET=your_session_secret_here_change_in_production

# ============================================================================
# Production Settings (Uncomment for production deployment)
# ============================================================================
# NODE_ENV=production
# DEBUG=false
# LOG_LEVEL=WARN
# FRONTEND_URL=https://yourdomain.com
# SPOTIFY_REDIRECT_URI=https://yourdomain.com/auth/callback

# ============================================================================
# Development Tools (Optional)
# ============================================================================
# BROWSERBASE_API_KEY=your_browserbase_api_key_here
# BROWSERBASE_PROJECT_ID=your_browserbase_project_id_here
`;

    fs.writeFileSync('.env', envTemplate);
    log.success('Created optimized .env file with comprehensive configuration');
    log.info('Edit .env file to add your API keys (optional for demo mode)');
};

// Validate package.json scripts
const validatePackageJson = () => {
    log.info('Validating package.json configuration...');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        // Check if modern scripts are present
        const modernScripts = [
            'install:modern',
            'health:full',
            'mcp:install',
            'mcp:health'
        ];
        
        const missingScripts = modernScripts.filter(script => !packageJson.scripts[script]);
        
        if (missingScripts.length > 0) {
            log.warning(`Missing modern scripts: ${missingScripts.join(', ')}`);
            log.info('Run: npm install to update package.json with modern scripts');
        } else {
            log.success('Package.json has modern script configuration');
        }
        
        // Check engines
        if (packageJson.engines) {
            log.success(`Node.js requirement: ${packageJson.engines.node || 'not specified'}`);
        } else {
            log.warning('No engine requirements specified in package.json');
        }
        
    } catch (e) {
        log.error('Unable to validate package.json: ' + e.message);
    }
};

// Create Python virtual environment
const createPythonVenv = () => {
    log.info('Checking Python virtual environment...');
    
    if (fs.existsSync('venv')) {
        log.info('Python virtual environment already exists');
        return;
    }
    
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
        const process = spawn('python3', ['-m', 'venv', 'venv'], { stdio: 'pipe' });
        
        process.on('close', (code) => {
            if (code === 0) {
                log.success('Created Python virtual environment');
                log.info('Activate with: source venv/bin/activate (Linux/Mac) or venv\\Scripts\\activate (Windows)');
            } else {
                log.warning('Failed to create Python virtual environment (non-critical)');
            }
            resolve();
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
            process.kill();
            log.warning('Python virtual environment creation timed out');
            resolve();
        }, 30000);
    });
};

// Check and create essential directories
const createDirectories = () => {
    log.info('Ensuring essential directories exist...');
    
    const directories = [
        'logs',
        'tmp',
        'data',
        'docs/api'
    ];
    
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            log.success(`Created directory: ${dir}`);
        }
    });
};

// Validate and fix Node.js configuration
const validateNodeConfig = () => {
    log.info('Validating Node.js configuration...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (major >= 20) {
        log.success(`Node.js version ${nodeVersion} is optimal`);
    } else if (major >= 18) {
        log.warning(`Node.js version ${nodeVersion} is supported but consider upgrading to v20+`);
    } else {
        log.error(`Node.js version ${nodeVersion} is below minimum requirement (18+)`);
        log.info('Please upgrade Node.js from https://nodejs.org/');
    }
    
    // Check npm version
    const npmVersion = require('child_process')
        .execSync('npm --version', { encoding: 'utf8' })
        .trim();
    
    log.info(`npm version: ${npmVersion}`);
};

// Main validation function
const main = async () => {
    console.log(`${colors.blue}╔═══════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.blue}║       Environment Validation Tool        ║${colors.reset}`);
    console.log(`${colors.blue}╚═══════════════════════════════════════════╝${colors.reset}\n`);
    
    try {
        validateNodeConfig();
        validatePackageJson();
        fixGitignore();
        createOptimizedEnv();
        createDirectories();
        await createPythonVenv();
        
        console.log(`\n${colors.green}✅ Environment validation completed successfully!${colors.reset}\n`);
        
        log.info('Next steps:');
        console.log('   1. Edit .env file with your API keys (optional)');
        console.log('   2. Run: npm start (or npm run dev for development)');
        console.log('   3. Run: npm run health:full (to verify setup)');
        console.log('   4. Open: http://localhost:3000\n');
        
        log.info('Demo mode is available without any API keys!');
        
    } catch (error) {
        log.error(`Validation failed: ${error.message}`);
        process.exit(1);
    }
};

if (require.main === module) {
    main();
}

module.exports = { main };