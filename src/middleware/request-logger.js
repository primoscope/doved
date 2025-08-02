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
