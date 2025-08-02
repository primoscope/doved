#!/usr/bin/env node

/**
 * Enhanced Browser Tools Integration for EchoTune AI
 * Provides improved web player interaction with comprehensive error checking
 * Implements validation systems and performance monitoring
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class EnhancedBrowserTools {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.browser = null;
    this.pages = new Map();
    this.operationLog = [];
    this.performanceMetrics = new Map();
    this.validationRules = new Map();
    
    this.initializeValidationRules();
  }

  initializeValidationRules() {
    this.validationRules.set('allowedDomains', [
      'open.spotify.com',
      'accounts.spotify.com',
      'api.spotify.com',
      'localhost',
      '127.0.0.1'
    ]);
    
    this.validationRules.set('blockedElements', [
      'script[src*="analytics"]',
      'script[src*="tracking"]',
      'iframe[src*="ads"]'
    ]);
    
    this.validationRules.set('maxPageLoadTime', 15000);
    this.validationRules.set('maxScreenshotSize', 5 * 1024 * 1024); // 5MB
  }

  /**
   * Initialize browser with enhanced configuration
   */
  async initializeBrowser() {
    if (this.browser) {
      return this.browser;
    }

    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      this.browser = await puppeteer.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      // Set up error handling
      this.browser.on('disconnected', () => {
        console.log('🔌 Browser disconnected');
        this.browser = null;
      });

      const endTime = Date.now();
      this.logOperation('browser_init', 'browser', true, {
        operationId,
        performanceMs: endTime - startTime,
        headless: this.headless
      });

      this.recordPerformance('browser_init', endTime - startTime);
      return this.browser;

    } catch (error) {
      const endTime = Date.now();
      this.logOperation('browser_init', 'browser', false, {
        operationId,
        performanceMs: endTime - startTime,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Navigate to URL with comprehensive validation
   */
  async navigateToUrl(url, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      // Validate URL
      this.validateUrl(url);

      const browser = await this.initializeBrowser();
      const page = await browser.newPage();
      
      // Set up page monitoring
      await this.setupPageMonitoring(page);
      
      // Block unwanted resources if specified
      if (options.blockAds) {
        await this.blockUnwantedResources(page);
      }

      // Navigate with timeout
      await page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: this.validationRules.get('maxPageLoadTime')
      });

      // Wait for specific element if specified
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: this.timeout
        });
      }

      const endTime = Date.now();
      const pageId = this.generateOperationId();
      this.pages.set(pageId, page);

      const result = {
        success: true,
        pageId,
        url,
        title: await page.title(),
        metadata: {
          operationId,
          performanceMs: endTime - startTime,
          timestamp: new Date().toISOString()
        }
      };

      this.logOperation('navigate', url, true, result.metadata);
      this.recordPerformance('navigate', endTime - startTime);

      return result;

    } catch (error) {
      const endTime = Date.now();
      this.logOperation('navigate', url, false, {
        operationId,
        performanceMs: endTime - startTime,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enhanced screenshot capture with validation
   */
  async captureScreenshot(pageId, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      const page = this.pages.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }

      // Wait for page to be ready
      await page.waitForLoadState?.('networkidle') || 
            await new Promise(resolve => setTimeout(resolve, 1000));

      const screenshotOptions = {
        type: options.format || 'png',
        quality: options.quality || 90,
        fullPage: options.fullPage || false,
        ...options
      };

      const screenshot = await page.screenshot(screenshotOptions);

      // Validate screenshot size
      if (screenshot.length > this.validationRules.get('maxScreenshotSize')) {
        throw new Error('Screenshot size exceeds maximum allowed size');
      }

      const endTime = Date.now();

      const result = {
        success: true,
        screenshot,
        size: screenshot.length,
        format: screenshotOptions.type,
        metadata: {
          operationId,
          performanceMs: endTime - startTime,
          timestamp: new Date().toISOString(),
          pageId
        }
      };

      // Save screenshot if path provided
      if (options.savePath) {
        await fs.writeFile(options.savePath, screenshot);
        result.savedTo = options.savePath;
      }

      this.logOperation('screenshot', pageId, true, result.metadata);
      this.recordPerformance('screenshot', endTime - startTime);

      return result;

    } catch (error) {
      const endTime = Date.now();
      this.logOperation('screenshot', pageId, false, {
        operationId,
        performanceMs: endTime - startTime,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Spotify Web Player specific interactions
   */
  async spotifyWebPlayerActions(pageId, action, params = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    try {
      const page = this.pages.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }

      // Verify we're on Spotify
      const url = page.url();
      if (!url.includes('open.spotify.com')) {
        throw new Error('Not on Spotify Web Player');
      }

      let result;
      switch (action) {
        case 'login':
          result = await this.spotifyLogin(page, params);
          break;
        case 'search':
          result = await this.spotifySearch(page, params.query);
          break;
        case 'play':
          result = await this.spotifyPlay(page, params.trackId);
          break;
        case 'pause':
          result = await this.spotifyPause(page);
          break;
        case 'createPlaylist':
          result = await this.spotifyCreatePlaylist(page, params);
          break;
        case 'getPlayerState':
          result = await this.spotifyGetPlayerState(page);
          break;
        default:
          throw new Error(`Unknown Spotify action: ${action}`);
      }

      const endTime = Date.now();
      this.logOperation('spotify_action', `${action}:${pageId}`, true, {
        operationId,
        action,
        performanceMs: endTime - startTime,
        params: Object.keys(params)
      });

      this.recordPerformance('spotify_action', endTime - startTime);
      return result;

    } catch (error) {
      const endTime = Date.now();
      this.logOperation('spotify_action', `${action}:${pageId}`, false, {
        operationId,
        action,
        performanceMs: endTime - startTime,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Spotify-specific helper methods
   */
  async spotifyLogin(page, { username, password }) {
    // Wait for login form
    await page.waitForSelector('#login-username', { timeout: this.timeout });
    
    // Fill login form
    await page.type('#login-username', username);
    await page.type('#login-password', password);
    await page.click('#login-button');
    
    // Wait for redirect to web player
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    return {
      success: true,
      action: 'login',
      url: page.url()
    };
  }

  async spotifySearch(page, query) {
    // Click search
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', query);
    await page.keyboard.press('Enter');
    
    // Wait for results
    await page.waitForSelector('[data-testid="search-results"]', {
      timeout: this.timeout
    });
    
    // Extract search results
    const results = await page.evaluate(() => {
      const tracks = Array.from(document.querySelectorAll('[data-testid="track-row"]'));
      return tracks.slice(0, 10).map(track => ({
        name: track.querySelector('[data-testid="track-name"]')?.textContent,
        artist: track.querySelector('[data-testid="artist-name"]')?.textContent,
        duration: track.querySelector('[data-testid="track-duration"]')?.textContent
      }));
    });
    
    return {
      success: true,
      action: 'search',
      query,
      results
    };
  }

  async spotifyPlay(page, trackId) {
    // Implementation for playing specific track
    await page.evaluate((id) => {
      // Use Spotify Web Player SDK if available
      if (window.Spotify && window.Spotify.Player) {
        window.Spotify.Player.play({ uris: [`spotify:track:${id}`] });
      }
    }, trackId);
    
    return {
      success: true,
      action: 'play',
      trackId
    };
  }

  async spotifyPause(page) {
    await page.click('[data-testid="control-button-pause"], [data-testid="control-button-play"]');
    
    return {
      success: true,
      action: 'pause'
    };
  }

  async spotifyCreatePlaylist(page, { name, description = '', isPublic = false }) {
    // Navigate to playlist creation
    await page.click('[data-testid="create-playlist-button"]');
    
    // Fill playlist details
    await page.waitForSelector('[data-testid="playlist-edit-details-name-input"]');
    await page.type('[data-testid="playlist-edit-details-name-input"]', name);
    
    if (description) {
      await page.type('[data-testid="playlist-edit-details-description-input"]', description);
    }
    
    // Set privacy
    if (!isPublic) {
      await page.click('[data-testid="playlist-edit-details-privacy-toggle"]');
    }
    
    await page.click('[data-testid="playlist-edit-details-save-button"]');
    
    return {
      success: true,
      action: 'createPlaylist',
      name,
      description,
      isPublic
    };
  }

  async spotifyGetPlayerState(page) {
    const state = await page.evaluate(() => {
      // Extract current player state
      const playButton = document.querySelector('[data-testid="control-button-pause"]');
      const trackName = document.querySelector('[data-testid="now-playing-track-name"]')?.textContent;
      const artistName = document.querySelector('[data-testid="now-playing-artist"]')?.textContent;
      
      return {
        isPlaying: !!playButton,
        currentTrack: trackName,
        currentArtist: artistName,
        timestamp: new Date().toISOString()
      };
    });
    
    return {
      success: true,
      action: 'getPlayerState',
      state
    };
  }

  /**
   * Enhanced page monitoring setup
   */
  async setupPageMonitoring(page) {
    // Monitor console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('🔴 Page Error:', msg.text());
      }
    });

    // Monitor failed requests
    page.on('requestfailed', request => {
      console.log('🔴 Request Failed:', request.url());
    });

    // Monitor page errors
    page.on('pageerror', error => {
      console.log('🔴 Page Error:', error.message);
    });
  }

  /**
   * Block unwanted resources for faster loading
   */
  async blockUnwantedResources(page) {
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
      const url = request.url();
      const resourceType = request.resourceType();
      
      // Block ads, analytics, and tracking
      if (resourceType === 'image' && url.includes('ads') ||
          url.includes('analytics') ||
          url.includes('tracking') ||
          url.includes('facebook') ||
          url.includes('google-analytics')) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  /**
   * URL validation
   */
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      const allowedDomains = this.validationRules.get('allowedDomains');
      
      const isAllowed = allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
      
      if (!isAllowed) {
        throw new Error(`Domain not allowed: ${urlObj.hostname}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Invalid URL: ${url} - ${error.message}`);
    }
  }

  /**
   * Utility methods
   */
  generateOperationId() {
    return Math.random().toString(36).substr(2, 9);
  }

  logOperation(operation, target, success, details = {}) {
    const logEntry = {
      id: this.generateOperationId(),
      timestamp: new Date().toISOString(),
      operation,
      target,
      success,
      details
    };
    
    this.operationLog.push(logEntry);
    
    // Keep only recent operations
    if (this.operationLog.length > 1000) {
      this.operationLog = this.operationLog.slice(-1000);
    }
    
    console.log(`🌐 Browser ${success ? '✅' : '❌'}: ${operation} on ${target}`);
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
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.browser) {
        await this.initializeBrowser();
      }
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        browserConnected: !!this.browser,
        activePagesCount: this.pages.size,
        recentOperations: this.operationLog.length,
        performanceMetrics: this.getPerformanceAnalytics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    try {
      // Close all pages
      for (const [pageId, page] of this.pages) {
        await page.close();
      }
      this.pages.clear();
      
      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.logOperation('cleanup', 'browser', true, {
        pagesCount: this.pages.size
      });
      
    } catch (error) {
      this.logOperation('cleanup', 'browser', false, {
        error: error.message
      });
    }
  }
}

module.exports = { EnhancedBrowserTools };

// CLI usage
if (require.main === module) {
  const browserTools = new EnhancedBrowserTools();
  
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  async function runCommand() {
    try {
      switch (command) {
        case 'health':
          const health = await browserTools.healthCheck();
          console.log(JSON.stringify(health, null, 2));
          break;
        case 'navigate':
          if (!args[0]) throw new Error('URL required');
          const nav = await browserTools.navigateToUrl(args[0]);
          console.log(JSON.stringify(nav, null, 2));
          break;
        case 'screenshot':
          if (!args[0]) throw new Error('Page ID required');
          const screenshot = await browserTools.captureScreenshot(args[0], {
            savePath: args[1] || 'screenshot.png'
          });
          console.log(JSON.stringify(screenshot, null, 2));
          break;
        case 'performance':
          const perf = browserTools.getPerformanceAnalytics();
          console.log(JSON.stringify(perf, null, 2));
          break;
        default:
          console.log('Available commands: health, navigate, screenshot, performance');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      await browserTools.cleanup();
    }
  }
  
  runCommand();
}