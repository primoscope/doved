#!/bin/bash

# EchoTune AI - Enhanced Integration and Testing Script
# Completes remaining integrations and phases

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Enhanced health endpoint integration
enhance_health_endpoints() {
    log_step "Enhancing health endpoints..."
    
    # Update main index.js to include enhanced health checks
    if [ -f "src/index.js" ]; then
        log_info "Adding enhanced health endpoints to main application..."
        
        # Check if health endpoints are already integrated
        if ! grep -q "health-checker" src/index.js; then
            cat >> src/index.js <<'EOF'

// Enhanced Health Check Integration
const { performHealthCheck, isReady, isAlive, runCheck } = require('./utils/health-check');

// Comprehensive health check endpoint
app.get('/health', async (req, res) => {
    try {
        const healthResult = await performHealthCheck();
        const statusCode = healthResult.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(healthResult);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Individual component health checks
app.get('/health/:component', async (req, res) => {
    try {
        const component = req.params.component;
        const result = await runCheck(component);
        const statusCode = result.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(404).json({
            status: 'error',
            message: `Unknown health check component: ${req.params.component}`,
            timestamp: new Date().toISOString()
        });
    }
});

// Readiness probe for load balancers
app.get('/ready', async (req, res) => {
    try {
        const ready = await isReady();
        res.status(ready ? 200 : 503).json({
            status: ready ? 'ready' : 'not ready',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'not ready',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Liveness probe
app.get('/alive', async (req, res) => {
    try {
        const alive = await isAlive();
        res.status(alive ? 200 : 503).json({
            status: alive ? 'alive' : 'dead',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'dead',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
EOF
            log_success "Enhanced health endpoints added"
        else
            log_success "Enhanced health endpoints already integrated"
        fi
    fi
}

# Enhanced error handling and middleware
add_enhanced_middleware() {
    log_step "Adding enhanced middleware..."
    
    mkdir -p src/middleware
    
    # Create comprehensive error handling middleware
    cat > src/middleware/error-handler.js <<'EOF'
// Enhanced Error Handling Middleware for EchoTune AI

class ErrorHandler {
    static handle(err, req, res, next) {
        console.error('Error occurred:', {
            error: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });

        // Default error status
        let statusCode = err.statusCode || 500;
        let message = err.message || 'Internal Server Error';

        // Handle specific error types
        if (err.name === 'ValidationError') {
            statusCode = 400;
            message = 'Validation Error';
        } else if (err.name === 'UnauthorizedError') {
            statusCode = 401;
            message = 'Unauthorized';
        } else if (err.name === 'CastError') {
            statusCode = 400;
            message = 'Invalid ID format';
        } else if (err.code === 11000) {
            statusCode = 409;
            message = 'Duplicate field value';
        }

        // In production, don't expose internal errors
        if (process.env.NODE_ENV === 'production' && statusCode === 500) {
            message = 'Something went wrong';
        }

        res.status(statusCode).json({
            success: false,
            error: {
                message,
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            },
            timestamp: new Date().toISOString()
        });
    }

    static notFound(req, res, next) {
        const error = new Error(`Route not found - ${req.originalUrl}`);
        error.statusCode = 404;
        next(error);
    }

    static asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }
}

module.exports = ErrorHandler;
EOF

    # Create request logging middleware
    cat > src/middleware/request-logger.js <<'EOF'
// Request Logging Middleware for EchoTune AI

const fs = require('fs');
const path = require('path');

class RequestLogger {
    constructor(options = {}) {
        this.logToFile = options.logToFile || false;
        this.logFile = options.logFile || path.join(process.cwd(), 'logs', 'access.log');
        this.includeBody = options.includeBody || false;
        
        // Ensure log directory exists
        if (this.logToFile) {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            const startDate = new Date();

            // Capture original end function
            const originalEnd = res.end;

            res.end = function(chunk, encoding) {
                // Call original end function
                originalEnd.call(res, chunk, encoding);

                // Calculate response time
                const responseTime = Date.now() - startTime;

                // Create log entry
                const logEntry = {
                    timestamp: startDate.toISOString(),
                    method: req.method,
                    url: req.url,
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent'),
                    status: res.statusCode,
                    responseTime: `${responseTime}ms`,
                    contentLength: res.get('Content-Length') || 0,
                    referer: req.get('Referer') || '-'
                };

                // Include request body if enabled (be careful with sensitive data)
                if (this.includeBody && req.body && Object.keys(req.body).length > 0) {
                    logEntry.body = req.body;
                }

                // Log to console
                console.log(`${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`);

                // Log to file if enabled
                if (this.logToFile) {
                    const logLine = JSON.stringify(logEntry) + '\n';
                    fs.appendFileSync(this.logFile, logLine);
                }
            }.bind(this);

            next();
        };
    }
}

module.exports = RequestLogger;
EOF

    log_success "Enhanced middleware created"
}

# Enhanced security middleware
add_security_middleware() {
    log_step "Adding security middleware..."
    
    cat > src/middleware/security.js <<'EOF'
// Security Middleware for EchoTune AI

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

class SecurityMiddleware {
    // Rate limiting configuration
    static createRateLimiter(options = {}) {
        const defaultOptions = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
        };

        return rateLimit({ ...defaultOptions, ...options });
    }

    // API rate limiting (more restrictive)
    static apiRateLimit = this.createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 50,
        message: {
            error: 'API rate limit exceeded, please try again later',
            retryAfter: '15 minutes'
        }
    });

    // Auth rate limiting (very restrictive)
    static authRateLimit = this.createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: {
            error: 'Too many authentication attempts, please try again later',
            retryAfter: '15 minutes'
        }
    });

    // Helmet security headers
    static helmet = helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https://api.spotify.com', 'https://accounts.spotify.com'],
                fontSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false
    });

    // CORS configuration
    static corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, etc.)
            if (!origin) return callback(null, true);
            
            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:3001',
                process.env.FRONTEND_URL,
                process.env.DOMAIN ? `https://${process.env.DOMAIN}` : null,
                process.env.DOMAIN ? `http://${process.env.DOMAIN}` : null
            ].filter(Boolean);

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`CORS blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        optionsSuccessStatus: 200
    };

    // Input sanitization
    static sanitizeInput(req, res, next) {
        // Sanitize request body
        if (req.body) {
            req.body = SecurityMiddleware.sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query) {
            req.query = SecurityMiddleware.sanitizeObject(req.query);
        }

        next();
    }

    static sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Basic XSS prevention
                sanitized[key] = value
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
            } else if (typeof value === 'object') {
                sanitized[key] = SecurityMiddleware.sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    // Request size limiting
    static requestSizeLimit = {
        json: { limit: '10mb' },
        urlencoded: { limit: '10mb', extended: true }
    };
}

module.exports = SecurityMiddleware;
EOF

    log_success "Security middleware created"
}

# Create comprehensive testing setup
create_testing_setup() {
    log_step "Creating comprehensive testing setup..."
    
    mkdir -p tests/integration tests/unit tests/e2e
    
    # Integration test for deployment
    cat > tests/integration/deployment.test.js <<'EOF'
// Deployment Integration Tests for EchoTune AI

const axios = require('axios');
const { spawn } = require('child_process');

describe('Deployment Integration Tests', () => {
    const baseURL = process.env.TEST_URL || 'http://localhost:3000';
    const timeout = 30000;

    beforeAll(async () => {
        // Wait for application to be ready
        await waitForApp(baseURL, timeout);
    }, timeout);

    describe('Health Endpoints', () => {
        test('GET /health should return comprehensive health status', async () => {
            const response = await axios.get(`${baseURL}/health`);
            
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('timestamp');
            expect(response.data).toHaveProperty('checks');
            expect(response.data.checks).toHaveProperty('application');
            expect(response.data.checks).toHaveProperty('environment');
        });

        test('GET /ready should return readiness status', async () => {
            const response = await axios.get(`${baseURL}/ready`);
            
            expect([200, 503]).toContain(response.status);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('timestamp');
        });

        test('GET /alive should return liveness status', async () => {
            const response = await axios.get(`${baseURL}/alive`);
            
            expect([200, 503]).toContain(response.status);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('uptime');
        });
    });

    describe('Application Endpoints', () => {
        test('GET / should return main application', async () => {
            const response = await axios.get(baseURL);
            
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/html/);
        });

        test('GET /api/chat should be accessible', async () => {
            const response = await axios.get(`${baseURL}/api/chat`, {
                validateStatus: () => true // Accept any status code
            });
            
            // Should not return 404
            expect(response.status).not.toBe(404);
        });
    });

    describe('Security Headers', () => {
        test('Should include security headers', async () => {
            const response = await axios.get(baseURL);
            
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });
    });

    describe('Performance', () => {
        test('Health endpoint should respond quickly', async () => {
            const startTime = Date.now();
            await axios.get(`${baseURL}/health`);
            const responseTime = Date.now() - startTime;
            
            expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
        });
    });
});

async function waitForApp(url, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            await axios.get(`${url}/alive`, { timeout: 2000 });
            return;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`Application did not become ready within ${timeout}ms`);
}
EOF

    # Unit test for health checker
    cat > tests/unit/health-checker.test.js <<'EOF'
// Health Checker Unit Tests

const HealthChecker = require('../../src/utils/health-checker');

describe('HealthChecker', () => {
    let healthChecker;

    beforeEach(() => {
        healthChecker = new HealthChecker();
    });

    describe('Basic Functionality', () => {
        test('should initialize with default checks', () => {
            expect(healthChecker.checks.size).toBeGreaterThan(0);
            expect(healthChecker.checks.has('application')).toBe(true);
            expect(healthChecker.checks.has('environment')).toBe(true);
            expect(healthChecker.checks.has('system')).toBe(true);
        });

        test('should register custom check', () => {
            const customCheck = async () => ({ healthy: true, message: 'test' });
            healthChecker.registerCheck('custom', customCheck);
            
            expect(healthChecker.checks.has('custom')).toBe(true);
        });
    });

    describe('Health Checks', () => {
        test('should run application check', async () => {
            const result = await healthChecker.runCheck('application');
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('timestamp');
            expect(['healthy', 'unhealthy', 'error']).toContain(result.status);
        });

        test('should run environment check', async () => {
            const result = await healthChecker.runCheck('environment');
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('details');
            expect(['healthy', 'unhealthy', 'error']).toContain(result.status);
        });

        test('should handle unknown check gracefully', async () => {
            const result = await healthChecker.runCheck('nonexistent');
            
            expect(result.status).toBe('error');
            expect(result.message).toContain('Unknown health check');
        });
    });

    describe('All Checks', () => {
        test('should run all checks and return summary', async () => {
            const result = await healthChecker.runAllChecks();
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('checks');
            expect(result).toHaveProperty('summary');
            expect(['healthy', 'degraded', 'error']).toContain(result.status);
        });
    });
});
EOF

    # E2E test setup
    cat > tests/e2e/user-flow.test.js <<'EOF'
// End-to-End User Flow Tests

const { chromium } = require('playwright');

describe('User Flow E2E Tests', () => {
    let browser, page;
    const baseURL = process.env.TEST_URL || 'http://localhost:3000';

    beforeAll(async () => {
        browser = await chromium.launch({ headless: true });
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    test('should load main page successfully', async () => {
        await page.goto(baseURL);
        
        // Wait for page to load
        await page.waitForSelector('body');
        
        // Check page title
        const title = await page.title();
        expect(title).toContain('EchoTune');
    });

    test('should show chatbot interface', async () => {
        await page.goto(baseURL);
        
        // Look for chat interface elements
        const chatInterface = await page.locator('.chat-interface, #chat-container, [data-testid="chat"]').first();
        await expect(chatInterface).toBeVisible({ timeout: 10000 });
    });

    test('should handle demo chat interaction', async () => {
        await page.goto(baseURL);
        
        // Find chat input
        const chatInput = await page.locator('input[type="text"], textarea').first();
        if (await chatInput.isVisible()) {
            await chatInput.fill('Hello, recommend some music');
            
            // Find and click send button
            const sendButton = await page.locator('button:has-text("Send"), button[type="submit"]').first();
            if (await sendButton.isVisible()) {
                await sendButton.click();
                
                // Wait for response (may take a moment)
                await page.waitForTimeout(2000);
            }
        }
    });
});
EOF

    # Test configuration
    cat > tests/jest.config.js <<'EOF'
module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/test/**',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 30000
};
EOF

    log_success "Comprehensive testing setup created"
}

# Update documentation
update_documentation() {
    log_step "Updating documentation..."
    
    # Create deployment guide update
    cat > ENHANCED_DEPLOYMENT_GUIDE.md <<'EOF'
# EchoTune AI - Enhanced Deployment Guide

## Quick Deployment Options

### 1. Standard Production Deployment
```bash
npm run deploy
# Full production deployment with all features
```

### 2. Simplified Deployment
```bash
npm run deploy:simple
# Quick deployment for development/testing
```

### 3. DigitalOcean Quick Deploy
```bash
npm run deploy:digitalocean
# Optimized for DigitalOcean droplets
```

## New Features

### Enhanced Health Monitoring
- `/health` - Comprehensive system health
- `/health/:component` - Individual component checks
- `/ready` - Readiness probe for load balancers
- `/alive` - Simple liveness check

### Security Enhancements
- Rate limiting on all endpoints
- Comprehensive input sanitization
- Security headers (CSP, HSTS, etc.)
- CORS protection

### Error Handling
- Comprehensive error middleware
- Request logging and monitoring
- Graceful error recovery

### Testing Suite
- Integration tests for deployment
- Unit tests for health checks
- E2E tests for user flows
- Performance testing

## Management Commands

```bash
# Deployment
npm run deploy:simple          # Quick deployment
npm run deploy:digitalocean    # DigitalOcean optimized
npm run deploy                 # Full production deployment

# Integration
./scripts/integrate-mcp.sh     # MCP server integration

# Testing
npm test                       # Run all tests
npm run test:integration       # Integration tests only
npm run test:e2e              # End-to-end tests

# Health Monitoring
curl http://localhost:3000/health          # Full health check
curl http://localhost:3000/health/database # Database health only
curl http://localhost:3000/ready           # Readiness check
curl http://localhost:3000/alive           # Liveness check
```

## Troubleshooting

### Common Issues
1. **Port conflicts**: Check if ports 3000, 3001 are available
2. **Docker issues**: Restart Docker service
3. **Permission issues**: Ensure proper file permissions
4. **Environment variables**: Verify .env file configuration

### Debugging
```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Health diagnostics
curl -s http://localhost:3000/health | jq

# System resources
docker stats
```
EOF

    log_success "Documentation updated"
}

# Main integration function
main() {
    echo "🔧 EchoTune AI - Enhanced Integration & Phases"
    echo "============================================="
    echo ""
    
    enhance_health_endpoints
    add_enhanced_middleware
    add_security_middleware
    create_testing_setup
    update_documentation
    
    echo ""
    log_success "🎉 Enhanced integration completed!"
    echo ""
    echo "📋 What's been added:"
    echo "   ✅ Enhanced health monitoring endpoints"
    echo "   ✅ Comprehensive error handling middleware"
    echo "   ✅ Security middleware with rate limiting"
    echo "   ✅ Complete testing suite (unit, integration, E2E)"
    echo "   ✅ Enhanced documentation"
    echo ""
    echo "🚀 Deployment Options Available:"
    echo "   - npm run deploy:simple (Quick deployment)"
    echo "   - npm run deploy:digitalocean (DigitalOcean optimized)"
    echo "   - npm run deploy (Full production)"
    echo ""
    echo "🔧 Integration Scripts:"
    echo "   - ./scripts/integrate-mcp.sh (MCP server integration)"
    echo ""
    echo "🧪 Testing:"
    echo "   - npm test (Run all tests)"
    echo "   - npm run test:integration"
    echo "   - npm run test:e2e"
    echo ""
}

# Run main function
main "$@"