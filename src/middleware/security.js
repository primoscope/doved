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
    static getApiRateLimit() {
        return this.createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 50,
        message: {
            error: 'API rate limit exceeded, please try again later',
            retryAfter: '15 minutes'
        }
    });
    }

    // Auth rate limiting (very restrictive)
    static getAuthRateLimit() {
        return this.createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: {
            error: 'Too many authentication attempts, please try again later',
            retryAfter: '15 minutes'
        }
        });
    }

    // Helmet security headers
    static getHelmet() {
        return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ['\'self\''],
                styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://cdnjs.cloudflare.com'],
                scriptSrc: ['\'self\'', '\'unsafe-inline\'', 'https://cdnjs.cloudflare.com'],
                imgSrc: ['\'self\'', 'data:', 'https:'],
                connectSrc: ['\'self\'', 'https://api.spotify.com', 'https://accounts.spotify.com'],
                fontSrc: ['\'self\'', 'https://cdnjs.cloudflare.com'],
                objectSrc: ['\'none\''],
                mediaSrc: ['\'self\''],
                frameSrc: ['\'none\''],
            },
        },
        crossOriginEmbedderPolicy: false
        });
    }

    // CORS configuration
    static getCorsOptions() {
        return {
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
    }

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
    static getRequestSizeLimit() {
        return {
            json: { limit: '10mb' },
            urlencoded: { limit: '10mb', extended: true }
        };
    }
}

module.exports = SecurityMiddleware;
