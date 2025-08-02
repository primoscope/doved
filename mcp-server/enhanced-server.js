// Enhanced MCP Browser Automation Server for EchoTune AI
// Comprehensive testing and real-time interaction capabilities

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

class EnhancedMCPServer {
    constructor() {
        this.app = express();
        this.browser = null;
        this.page = null;
        this.port = process.env.MCP_SERVER_PORT || 3001;
        this.screenshotDir = process.env.SCREENSHOT_DIR || '/tmp/testing_screenshots';
        this.testResults = [];
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use('/screenshots', express.static(this.screenshotDir));
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                browser: this.browser ? 'connected' : 'disconnected',
                timestamp: new Date().toISOString()
            });
        });

        // Initialize browser
        this.app.post('/init', async (req, res) => {
            try {
                await this.initBrowser();
                res.json({ success: true, message: 'Browser initialized' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Take screenshot
        this.app.post('/screenshot', async (req, res) => {
            try {
                const { name = 'screenshot' } = req.body;
                const screenshot = await this.takeScreenshot(name);
                res.json({ success: true, screenshot });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Navigate to URL
        this.app.post('/navigate', async (req, res) => {
            try {
                const { url } = req.body;
                await this.navigate(url);
                res.json({ success: true, url });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Spotify login automation
        this.app.post('/spotify/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const result = await this.spotifyLogin(username, password);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Spotify interaction automation
        this.app.post('/spotify/interact', async (req, res) => {
            try {
                const { action, target } = req.body;
                const result = await this.spotifyInteract(action, target);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Comprehensive testing endpoint
        this.app.post('/test/comprehensive', async (req, res) => {
            try {
                const results = await this.runComprehensiveTests();
                res.json({ success: true, results });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get test results
        this.app.get('/test/results', (req, res) => {
            res.json({ results: this.testResults });
        });
    }

    async initBrowser() {
        console.log('Initializing browser for comprehensive testing...');
        
        if (this.browser) {
            await this.browser.close();
        }

        this.browser = await puppeteer.launch({
            headless: process.env.PUPPETEER_HEADLESS !== 'false',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        
        // Create screenshot directory
        await fs.mkdir(this.screenshotDir, { recursive: true });
        
        console.log('Browser initialized successfully');
    }

    async navigate(url) {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }
        
        console.log(`Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    async takeScreenshot(name) {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${name}_${timestamp}.png`;
        const filepath = path.join(this.screenshotDir, filename);
        
        await this.page.screenshot({ 
            path: filepath, 
            fullPage: true,
            type: 'png'
        });
        
        console.log(`Screenshot saved: ${filename}`);
        return { filename, filepath };
    }

    async spotifyLogin(username, password) {
        if (!username || !password) {
            throw new Error('Username and password required');
        }

        await this.navigate('https://accounts.spotify.com/login');
        await this.takeScreenshot('spotify_login_page');

        // Fill login form
        await this.page.waitForSelector('#login-username', { timeout: 10000 });
        await this.page.type('#login-username', username);
        await this.page.type('#login-password', password);
        
        await this.takeScreenshot('spotify_login_filled');

        // Submit form
        await this.page.click('#login-button');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        
        await this.takeScreenshot('spotify_login_result');

        // Check if login was successful
        const currentUrl = this.page.url();
        const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('error');

        return {
            success: isLoggedIn,
            url: currentUrl,
            timestamp: new Date().toISOString()
        };
    }

    async spotifyInteract(action, target) {
        const actions = {
            'play_track': async () => {
                await this.page.click('[data-testid="play-button"]');
                await this.takeScreenshot('spotify_play_track');
            },
            'create_playlist': async () => {
                await this.page.click('[data-testid="create-playlist-button"]');
                await this.takeScreenshot('spotify_create_playlist');
            },
            'search': async () => {
                await this.page.click('[data-testid="search-input"]');
                await this.page.type('[data-testid="search-input"]', target);
                await this.takeScreenshot('spotify_search');
            }
        };

        if (actions[action]) {
            await actions[action]();
            return { success: true, action, target };
        } else {
            throw new Error(`Unknown action: ${action}`);
        }
    }

    async runComprehensiveTests() {
        console.log('Starting comprehensive testing suite...');
        
        const tests = [
            {
                name: 'EchoTune Main Application',
                url: 'http://localhost:3000',
                checks: ['title', 'navigation', 'chat_interface', 'analytics_dashboard']
            },
            {
                name: 'Spotify OAuth Flow',
                url: 'http://localhost:3000/auth/spotify',
                checks: ['oauth_redirect', 'spotify_permissions']
            },
            {
                name: 'Health Check Endpoint',
                url: 'http://localhost:3000/health',
                checks: ['api_response', 'database_status', 'llm_providers']
            }
        ];

        for (const test of tests) {
            try {
                console.log(`Running test: ${test.name}`);
                await this.navigate(test.url);
                await this.page.waitForTimeout(3000); // Wait for page to load
                
                const result = await this.runTestChecks(test);
                this.testResults.push(result);
                
                await this.takeScreenshot(`test_${test.name.replace(/\s+/g, '_').toLowerCase()}`);
            } catch (error) {
                console.error(`Test failed: ${test.name}`, error);
                this.testResults.push({
                    name: test.name,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return this.testResults;
    }

    async runTestChecks(test) {
        const result = {
            name: test.name,
            url: test.url,
            success: false,
            checks: {},
            timestamp: new Date().toISOString()
        };

        try {
            // Basic page load check
            const title = await this.page.title();
            result.checks.page_title = title;

            // Check for specific elements based on test type
            if (test.checks.includes('chat_interface')) {
                const chatExists = await this.page.$('#chat-interface') !== null;
                result.checks.chat_interface = chatExists;
            }

            if (test.checks.includes('analytics_dashboard')) {
                const dashboardExists = await this.page.$('.analytics-dashboard') !== null;
                result.checks.analytics_dashboard = dashboardExists;
            }

            if (test.checks.includes('navigation')) {
                const navExists = await this.page.$('nav') !== null;
                result.checks.navigation = navExists;
            }

            // Check for API responses
            if (test.checks.includes('api_response')) {
                const content = await this.page.content();
                result.checks.api_response = content.includes('status') || content.includes('healthy');
            }

            result.success = Object.values(result.checks).some(check => check === true);
        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`Enhanced MCP Server running on port ${this.port}`);
            console.log(`Screenshots will be saved to: ${this.screenshotDir}`);
            console.log('Available endpoints:');
            console.log('  POST /init - Initialize browser');
            console.log('  POST /navigate - Navigate to URL');
            console.log('  POST /screenshot - Take screenshot');
            console.log('  POST /spotify/login - Spotify login automation');
            console.log('  POST /spotify/interact - Spotify interaction');
            console.log('  POST /test/comprehensive - Run comprehensive tests');
            console.log('  GET /test/results - Get test results');
            console.log('  GET /health - Health check');
        });

        // Cleanup on exit
        process.on('SIGINT', async () => {
            console.log('Shutting down MCP server...');
            await this.cleanup();
            process.exit(0);
        });
    }
}

// Start the server
const mcpServer = new EnhancedMCPServer();
mcpServer.start();

module.exports = EnhancedMCPServer;