/**
 * Security Enhancement and Monitoring System for EchoTune AI
 * Provides comprehensive security features, threat detection, and monitoring
 */

class SecurityManager {
  constructor() {
    this.config = {
      encryption: {
        algorithm: 'AES-GCM',
        keyLength: 256,
        ivLength: 96
      },
      session: {
        timeout: 30 * 60 * 1000, // 30 minutes
        maxConcurrent: 5,
        renewThreshold: 5 * 60 * 1000 // 5 minutes before expiry
      },
      rateLimit: {
        login: { attempts: 5, window: 15 * 60 * 1000 }, // 5 attempts per 15 min
        api: { requests: 1000, window: 60 * 1000 }, // 1000 req/min
        chat: { messages: 100, window: 60 * 1000 } // 100 messages/min
      },
      monitoring: {
        anomalyThreshold: 10,
        alertThreshold: 5,
        logRetention: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    };
    
    this.sessions = new Map();
    this.auditLog = [];
    this.rateLimiters = new Map();
    this.securityEvents = [];
    this.threatPatterns = this.initializeThreatPatterns();
    
    // Initialize method objects
    this.sessionManager = this.createSessionManager();
    this.inputValidator = this.createInputValidator();
    
    this.initializeSecurity();
  }

  /**
   * Initialize security subsystems
   */
  initializeSecurity() {
    this.setupCSPHeaders();
    this.initializeRateLimiters();
    this.setupSecurityEventListeners();
    this.startSecurityMonitoring();
  }

  /**
   * Content Security Policy setup
   */
  setupCSPHeaders() {
    if (typeof document === 'undefined') return;
    
    const csp = {
      'default-src': ['\'self\''],
      'script-src': ['\'self\'', '\'unsafe-inline\'', 'https://api.spotify.com'],
      'style-src': ['\'self\'', '\'unsafe-inline\''],
      'img-src': ['\'self\'', 'data:', 'https://i.scdn.co'],
      'connect-src': ['\'self\'', 'https://api.spotify.com', 'https://accounts.spotify.com'],
      'media-src': ['\'self\'', 'https://p.scdn.co'],
      'frame-src': ['https://open.spotify.com'],
      'upgrade-insecure-requests': []
    };
    
    const cspString = Object.entries(csp)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');
    
    // Set CSP meta tag if not already present (browser environment only)
    if (typeof document !== 'undefined' && !document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
      const meta = document.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', cspString);
      document.head.appendChild(meta);
    }
  }

  /**
   * Initialize rate limiters for different endpoints
   */
  initializeRateLimiters() {
    Object.entries(this.config.rateLimit).forEach(([name, config]) => {
      this.rateLimiters.set(name, {
        requests: [],
        config
      });
    });
  }

  /**
<<<<<<< HEAD
=======
   * Create session management methods
   */
  createSessionManager() {
    return {
      create: (userId, metadata = {}) => {
        const sessionId = this.generateSecureToken();
        const session = {
          id: sessionId,
          userId,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          expiresAt: Date.now() + this.config.session.timeout,
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            ip: metadata.ip || 'unknown',
            location: metadata.location || 'unknown',
            ...metadata
          },
          flags: {
            suspicious: false,
            requiresReauth: false
          }
        };
        
        // Check for concurrent sessions
        const userSessions = Array.from(this.sessions.values())
          .filter(s => s.userId === userId);
        
        if (userSessions.length >= this.config.session.maxConcurrent) {
          // Remove oldest session
          const oldest = userSessions.reduce((prev, current) => 
            prev.createdAt < current.createdAt ? prev : current
          );
          this.sessions.delete(oldest.id);
          this.logSecurityEvent('session_limit_exceeded', { userId, removedSession: oldest.id });
        }
        
        this.sessions.set(sessionId, session);
        this.logSecurityEvent('session_created', { sessionId, userId });
        
        return sessionId;
      },

      validate: (sessionId) => {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
          return { valid: false, reason: 'session_not_found' };
        }
        
        if (Date.now() > session.expiresAt) {
          this.sessions.delete(sessionId);
          this.logSecurityEvent('session_expired', { sessionId });
          return { valid: false, reason: 'session_expired' };
        }
        
        if (session.flags.suspicious) {
          return { valid: false, reason: 'session_suspicious' };
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        
        // Check if session needs renewal
        const timeToExpiry = session.expiresAt - Date.now();
        const needsRenewal = timeToExpiry < this.config.session.renewThreshold;
        
        return { 
          valid: true, 
          session,
          needsRenewal
        };
      },

      renew: (sessionId) => {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.expiresAt = Date.now() + this.config.session.timeout;
          session.lastActivity = Date.now();
          this.logSecurityEvent('session_renewed', { sessionId });
          return true;
        }
        return false;
      },

      destroy: (sessionId) => {
        const session = this.sessions.get(sessionId);
        if (session) {
          this.sessions.delete(sessionId);
          this.logSecurityEvent('session_destroyed', { sessionId });
          return true;
        }
        return false;
      },

      flagSuspicious: (sessionId, reason) => {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.flags.suspicious = true;
          this.logSecurityEvent('session_flagged', { sessionId, reason });
        }
      }
    };
  }

  /**
   * Create input validation methods
   */
  createInputValidator() {
    return {
      sanitizeString: (input, maxLength = 1000) => {
        if (typeof input !== 'string') return '';
        
        return input
          .slice(0, maxLength)
          .replace(/[<>"'&]/g, (match) => {
            const entities = {
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              '\'': '&#x27;',
              '&': '&amp;'
            };
            return entities[match] || match;
          });
      },

      validateEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
      },

      validateSpotifyURI: (uri) => {
        const spotifyURIRegex = /^spotify:(track|album|artist|playlist):[a-zA-Z0-9]{22}$/;
        return spotifyURIRegex.test(uri);
      },

      detectSQLInjection: (input) => {
        const sqlPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
          /(UNION|OR|AND)\s+\d+\s*=\s*\d+/i,
          /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
          /'.+--/,
          /\b(WAITFOR|DELAY)\b/i
        ];
        
        return sqlPatterns.some(pattern => pattern.test(input));
      },

      detectXSS: (input) => {
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/i,
          /on\w+\s*=/i,
          /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
          /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
        ];
        
        return xssPatterns.some(pattern => pattern.test(input));
      },

      validateInput: (input, type = 'string') => {
        if (typeof input !== 'string') {
          return { valid: false, reason: 'invalid_type' };
        }
        
        // Inline SQL injection detection
        const sqlPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
          /(UNION|OR|AND)\s+\d+\s*=\s*\d+/i,
          /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
          /'.+--/,
          /\b(WAITFOR|DELAY)\b/i
        ];
        
        if (sqlPatterns.some(pattern => pattern.test(input))) {
          return { valid: false, reason: 'sql_injection_detected' };
        }
        
        // Inline XSS detection
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/i,
          /on\w+\s*=/i,
          /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
          /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
        ];
        
        if (xssPatterns.some(pattern => pattern.test(input))) {
          return { valid: false, reason: 'xss_detected' };
        }
        
        // Type-specific validation
        switch (type) {
          case 'email': {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(input) && input.length <= 254
              ? { valid: true } 
              : { valid: false, reason: 'invalid_email' };
          }
          
          case 'spotify_uri': {
            const spotifyURIRegex = /^spotify:(track|album|artist|playlist):[a-zA-Z0-9]{22}$/;
            return spotifyURIRegex.test(input)
              ? { valid: true }
              : { valid: false, reason: 'invalid_spotify_uri' };
          }
          
          default:
            return { valid: true };
        }
      }
    };
  }

  /**
>>>>>>> 1e0d5360242314d703de74bc50f71e0cb63d6a0b
   * Rate limiting with security features
   */
  checkRateLimit(type, identifier) {
    const limiter = this.rateLimiters.get(type);
    if (!limiter) return { allowed: true };
    
    const now = Date.now();
    const window = limiter.config.window;
    const maxRequests = limiter.config.attempts || limiter.config.requests;
    
    // Clean old requests
    limiter.requests = limiter.requests.filter(req => 
      now - req.timestamp < window && req.identifier === identifier
    );
    
    // Check if under limit
    const userRequests = limiter.requests.filter(req => req.identifier === identifier);
    
    if (userRequests.length < maxRequests) {
      limiter.requests.push({ timestamp: now, identifier });
      return { allowed: true };
    }
    
    // Rate limit exceeded
    this.logSecurityEvent('rate_limit_exceeded', { type, identifier });
    
    return {
      allowed: false,
      retryAfter: window - (now - userRequests[0].timestamp)
    };
  }

  /**
   * Threat detection patterns
   */
  initializeThreatPatterns() {
    return {
      bruteForce: {
        pattern: /^(login|auth)/,
        threshold: 10,
        window: 5 * 60 * 1000 // 5 minutes
      },
      scanningAttacks: {
        pattern: /^(\/\.|\.\.\/|etc\/passwd|proc\/)/,
        threshold: 5,
        window: 60 * 1000 // 1 minute
      },
      anomalousTraffic: {
        threshold: 1000,
        window: 60 * 1000 // 1000 requests per minute
      }
    };
  }

  /**
   * Security event logging
   */
  logSecurityEvent(type, data = {}) {
    const event = {
      id: this.generateSecureToken(),
      type,
      timestamp: Date.now(),
      data,
      severity: this.getEventSeverity(type),
      source: 'security_manager'
    };
    
    this.securityEvents.push(event);
    this.auditLog.push(event);
    
    // Trigger alerts for high-severity events
    if (event.severity === 'high' || event.severity === 'critical') {
      this.triggerSecurityAlert(event);
    }
    
    // Clean old logs
    this.cleanOldLogs();
  }

  /**
   * Security monitoring
   */
  startSecurityMonitoring() {
    setInterval(() => {
      this.detectAnomalies();
      this.checkSuspiciousSessions();
      this.analyzeSecurityTrends();
    }, 60000); // Every minute
  }

  detectAnomalies() {
    const now = Date.now();
    const window = 5 * 60 * 1000; // 5 minutes
    
    const recentEvents = this.securityEvents.filter(event => 
      now - event.timestamp < window
    );
    
    // Check for unusual patterns
    const eventCounts = {};
    recentEvents.forEach(event => {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    });
    
    Object.entries(eventCounts).forEach(([type, count]) => {
      if (count > this.config.monitoring.anomalyThreshold) {
        this.logSecurityEvent('anomaly_detected', { eventType: type, count, window });
      }
    });
  }

  checkSuspiciousSessions() {
    const now = Date.now();
    
    this.sessions.forEach((session, sessionId) => {
      // Check for inactive sessions
      const inactiveTime = now - session.lastActivity;
      if (inactiveTime > this.config.session.timeout) {
        this.sessionManager.destroy(sessionId);
      }
      
      // Check for suspicious patterns
      if (session.metadata.userAgent && this.isSuspiciousUserAgent(session.metadata.userAgent)) {
        this.sessionManager.flagSuspicious(sessionId, 'suspicious_user_agent');
      }
    });
  }

  analyzeSecurityTrends() {
    const now = Date.now();
    const window = 24 * 60 * 60 * 1000; // 24 hours
    
    const recentEvents = this.securityEvents.filter(event => 
      now - event.timestamp < window
    );
    
    const trends = {
      totalEvents: recentEvents.length,
      eventsByType: {},
      eventsBySeverity: {},
      hourlyDistribution: new Array(24).fill(0)
    };
    
    recentEvents.forEach(event => {
      trends.eventsByType[event.type] = (trends.eventsByType[event.type] || 0) + 1;
      trends.eventsBySeverity[event.severity] = (trends.eventsBySeverity[event.severity] || 0) + 1;
      
      const hour = new Date(event.timestamp).getHours();
      trends.hourlyDistribution[hour]++;
    });
    
    // Store trends for reporting
    this.securityTrends = trends;
  }

  /**
   * Utility methods
   */
  generateSecureToken() {
    if (typeof window !== 'undefined' && window.crypto) {
      // Browser environment
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } else {
      // Node.js environment
      try {
        const crypto = require('crypto');
        const buffer = crypto.randomBytes(32);
        return buffer.toString('hex');
      } catch (error) {
        // Fallback for environments without crypto
        console.warn('Crypto not available, using fallback token generation');
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
    }
  }

  getEventSeverity(eventType) {
    const severityMap = {
      session_created: 'low',
      session_expired: 'low',
      session_renewed: 'low',
      session_destroyed: 'low',
      session_flagged: 'medium',
      rate_limit_exceeded: 'medium',
      sql_injection_detected: 'high',
      xss_detected: 'high',
      anomaly_detected: 'high',
      session_limit_exceeded: 'medium'
    };
    
    return severityMap[eventType] || 'medium';
  }

  isSuspiciousUserAgent(userAgent) {
    const suspiciousPatterns = [
      /bot|crawler|spider/i,
      /curl|wget|python-requests/i,
      /scanner|exploit/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  triggerSecurityAlert(event) {
    console.warn('Security Alert:', event);
    
    // Could integrate with external alerting systems
    if (typeof window !== 'undefined' && window.securityAlertCallback) {
      window.securityAlertCallback(event);
    }
  }

  cleanOldLogs() {
    const cutoff = Date.now() - this.config.monitoring.logRetention;
    this.auditLog = this.auditLog.filter(log => log.timestamp > cutoff);
    this.securityEvents = this.securityEvents.filter(event => event.timestamp > cutoff);
  }

  setupSecurityEventListeners() {
    if (typeof document === 'undefined') return;
    
    // Listen for security-related DOM events
    document.addEventListener('securityviolation', (event) => {
      this.logSecurityEvent('csp_violation', {
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        originalPolicy: event.originalPolicy
      });
    });
    
    if (typeof window !== 'undefined') {
      // Monitor for suspicious navigation
      window.addEventListener('beforeunload', () => {
        this.logSecurityEvent('page_unload', { timestamp: Date.now() });
      });
    }
  }

  /**
   * Security status and reporting
   */
  getSecurityStatus() {
    return {
      sessions: {
        active: this.sessions.size,
        suspicious: Array.from(this.sessions.values())
          .filter(s => s.flags.suspicious).length
      },
      events: {
        total: this.securityEvents.length,
        last24h: this.securityEvents.filter(e => 
          Date.now() - e.timestamp < 24 * 60 * 60 * 1000
        ).length
      },
      rateLimits: Object.fromEntries(
        Array.from(this.rateLimiters.entries()).map(([name, limiter]) => [
          name,
          limiter.requests.length
        ])
      ),
      trends: this.securityTrends
    };
  }

  generateSecurityReport() {
    const status = this.getSecurityStatus();
    const now = new Date();
    
    return {
      generatedAt: now.toISOString(),
      summary: {
        overallStatus: this.calculateOverallSecurityStatus(status),
        activeSessions: status.sessions.active,
        suspiciousSessions: status.sessions.suspicious,
        recentEvents: status.events.last24h,
        topThreats: this.getTopThreats()
      },
      details: status,
      recommendations: this.getSecurityRecommendations(status)
    };
  }

  calculateOverallSecurityStatus(status) {
    let score = 100;
    
    // Deduct points for suspicious activity
    score -= status.sessions.suspicious * 10;
    score -= Math.min(status.events.last24h / 10, 30);
    
    if (score >= 80) return 'secure';
    if (score >= 60) return 'warning';
    return 'alert';
  }

  getTopThreats() {
    const threatCounts = {};
    this.securityEvents
      .filter(e => Date.now() - e.timestamp < 24 * 60 * 60 * 1000)
      .forEach(event => {
        threatCounts[event.type] = (threatCounts[event.type] || 0) + 1;
      });
    
    return Object.entries(threatCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  getSecurityRecommendations(status) {
    const recommendations = [];
    
    if (status.sessions.suspicious > 0) {
      recommendations.push({
        priority: 'high',
        message: 'Suspicious sessions detected. Review and terminate if necessary.'
      });
    }
    
    if (status.events.last24h > 100) {
      recommendations.push({
        priority: 'medium',
        message: 'High number of security events. Consider reviewing logs.'
      });
    }
    
    return recommendations;
  }
}

// Initialize security manager
let securityManager;

// Check if we're in a browser environment
if (typeof window !== 'undefined') {
  securityManager = new SecurityManager();
}

// Browser-compatible exports
if (typeof window !== 'undefined') {
  window.SecurityManager = SecurityManager;
  window.securityManager = securityManager;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SecurityManager,
    securityManager
  };
}