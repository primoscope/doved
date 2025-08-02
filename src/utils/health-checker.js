// Enhanced Health Check System for EchoTune AI
const os = require('os');
const fs = require('fs');
const { promisify } = require('util');
const axios = require('axios');

const access = promisify(fs.access);
const stat = promisify(fs.stat);

class HealthChecker {
    constructor() {
        this.checks = new Map();
        this.registerDefaultChecks();
    }

    // Register default health checks
    registerDefaultChecks() {
        this.checks.set('application', this.checkApplication.bind(this));
        this.checks.set('environment', this.checkEnvironment.bind(this));
        this.checks.set('database', this.checkDatabase.bind(this));
        this.checks.set('system', this.checkSystem.bind(this));
        this.checks.set('mcp', this.checkMCPServer.bind(this));
        this.checks.set('storage', this.checkStorage.bind(this));
        this.checks.set('network', this.checkNetwork.bind(this));
    }

    // Register custom health check
    registerCheck(name, checkFunction) {
        this.checks.set(name, checkFunction);
    }

    // Run specific health check
    async runCheck(checkName) {
        const check = this.checks.get(checkName);
        if (!check) {
            return {
                status: 'error',
                message: `Unknown health check: ${checkName}`,
                timestamp: new Date().toISOString()
            };
        }

        try {
            const result = await check();
            return {
                status: result.healthy ? 'healthy' : 'unhealthy',
                ...result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Run all health checks
    async runAllChecks() {
        const results = {};
        const promises = Array.from(this.checks.keys()).map(async (checkName) => {
            results[checkName] = await this.runCheck(checkName);
        });

        await Promise.all(promises);

        // Determine overall health
        const allHealthy = Object.values(results).every(result => result.status === 'healthy');
        const hasErrors = Object.values(results).some(result => result.status === 'error');

        return {
            status: allHealthy ? 'healthy' : (hasErrors ? 'error' : 'degraded'),
            timestamp: new Date().toISOString(),
            checks: results,
            summary: this.generateSummary(results)
        };
    }

    // Generate health summary
    generateSummary(results) {
        const total = Object.keys(results).length;
        const healthy = Object.values(results).filter(r => r.status === 'healthy').length;
        const unhealthy = Object.values(results).filter(r => r.status === 'unhealthy').length;
        const errors = Object.values(results).filter(r => r.status === 'error').length;

        return {
            total,
            healthy,
            unhealthy,
            errors,
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0'
        };
    }

    // Application health check
    async checkApplication() {
        const memUsage = process.memoryUsage();
        const memUsageMB = {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
        };

        // Check memory usage (warn if heap used > 80% of heap total)
        const heapUsagePercent = (memUsageMB.heapUsed / memUsageMB.heapTotal) * 100;
        const memoryWarning = heapUsagePercent > 80;

        return {
            healthy: !memoryWarning,
            message: memoryWarning ? 'High memory usage detected' : 'Application running normally',
            details: {
                uptime: process.uptime(),
                memory: memUsageMB,
                memoryUsagePercent: Math.round(heapUsagePercent),
                nodeVersion: process.version,
                pid: process.pid,
                platform: process.platform,
                arch: process.arch
            }
        };
    }

    // Environment configuration check
    async checkEnvironment() {
        const requiredEnvVars = [
            'NODE_ENV',
            'PORT'
        ];

        const optionalEnvVars = [
            'SPOTIFY_CLIENT_ID',
            'SPOTIFY_CLIENT_SECRET',
            'MONGODB_URI',
            'REDIS_URL',
            'DOMAIN',
            'FRONTEND_URL'
        ];

        const missing = requiredEnvVars.filter(varName => !process.env[varName]);
        const configured = optionalEnvVars.filter(varName => process.env[varName]);

        return {
            healthy: missing.length === 0,
            message: missing.length > 0 ? `Missing required environment variables: ${missing.join(', ')}` : 'Environment properly configured',
            details: {
                nodeEnv: process.env.NODE_ENV,
                port: process.env.PORT,
                domain: process.env.DOMAIN || 'not set',
                requiredVars: requiredEnvVars.length,
                missingVars: missing,
                configuredOptionalVars: configured,
                totalConfigured: requiredEnvVars.length - missing.length + configured.length
            }
        };
    }

    // Database connectivity check
    async checkDatabase() {
        const results = {
            mongodb: { configured: false, connected: false },
            redis: { configured: false, connected: false }
        };

        // Check MongoDB
        if (process.env.MONGODB_URI) {
            results.mongodb.configured = true;
            try {
                // Try to connect using MongoDB client if available
                const { MongoClient } = require('mongodb');
                const client = new MongoClient(process.env.MONGODB_URI, {
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 5000
                });
                await client.connect();
                await client.db().admin().ping();
                await client.close();
                results.mongodb.connected = true;
            } catch (error) {
                results.mongodb.error = error.message;
            }
        }

        // Check Redis
        if (process.env.REDIS_URL) {
            results.redis.configured = true;
            try {
                // Try to connect using Redis client if available
                const redis = require('redis');
                const client = redis.createClient({ url: process.env.REDIS_URL });
                await client.connect();
                await client.ping();
                await client.quit();
                results.redis.connected = true;
            } catch (error) {
                results.redis.error = error.message;
            }
        }

        const hasConfiguredDbs = results.mongodb.configured || results.redis.configured;
        const allConnected = (!results.mongodb.configured || results.mongodb.connected) &&
                            (!results.redis.configured || results.redis.connected);

        return {
            healthy: !hasConfiguredDbs || allConnected,
            message: !hasConfiguredDbs ? 'No databases configured' : 
                    allConnected ? 'All configured databases connected' : 'Some database connections failed',
            details: results
        };
    }

    // System resources check
    async checkSystem() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsagePercent = (usedMem / totalMem) * 100;

        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;

        // Check disk space for current working directory
        let diskInfo = { available: 'unknown', usage: 'unknown' };
        try {
            const _stats = await stat(process.cwd());
            diskInfo = {
                path: process.cwd(),
                accessible: true
            };
        } catch (error) {
            diskInfo = {
                path: process.cwd(),
                accessible: false,
                error: error.message
            };
        }

        // Health warnings
        const warnings = [];
        if (memUsagePercent > 90) warnings.push('High memory usage');
        if (loadAvg[0] > cpuCount * 2) warnings.push('High CPU load');

        return {
            healthy: warnings.length === 0,
            message: warnings.length > 0 ? `System warnings: ${warnings.join(', ')}` : 'System resources normal',
            details: {
                memory: {
                    total: Math.round(totalMem / 1024 / 1024),
                    free: Math.round(freeMem / 1024 / 1024),
                    used: Math.round(usedMem / 1024 / 1024),
                    usagePercent: Math.round(memUsagePercent)
                },
                cpu: {
                    count: cpuCount,
                    loadAvg: loadAvg.map(load => Math.round(load * 100) / 100),
                    arch: os.arch(),
                    platform: os.platform()
                },
                disk: diskInfo,
                uptime: os.uptime(),
                hostname: os.hostname()
            }
        };
    }

    // MCP Server connectivity check
    async checkMCPServer() {
        const mcpUrl = process.env.MCP_URL || 'http://localhost:3001';
        
        try {
            const response = await axios.get(`${mcpUrl}/health`, {
                timeout: 5000,
                validateStatus: (status) => status === 200
            });
            
            return {
                healthy: true,
                message: 'MCP server is healthy',
                details: {
                    url: mcpUrl,
                    status: response.status,
                    responseTime: response.headers['x-response-time'] || 'unknown',
                    version: response.data.version || 'unknown'
                }
            };
        } catch (error) {
            return {
                healthy: false,
                message: 'MCP server unavailable',
                details: {
                    url: mcpUrl,
                    error: error.message,
                    code: error.code || 'unknown'
                }
            };
        }
    }

    // Storage and file system check
    async checkStorage() {
        const pathsToCheck = [
            process.cwd(),
            './logs',
            './tmp',
            './public'
        ];

        const results = {};
        
        for (const path of pathsToCheck) {
            try {
                await access(path, fs.constants.F_OK);
                const stats = await stat(path);
                results[path] = {
                    exists: true,
                    isDirectory: stats.isDirectory(),
                    isFile: stats.isFile(),
                    size: stats.size,
                    modified: stats.mtime
                };
            } catch (error) {
                results[path] = {
                    exists: false,
                    error: error.message
                };
            }
        }

        const allPathsAccessible = Object.values(results).every(result => result.exists);

        return {
            healthy: allPathsAccessible,
            message: allPathsAccessible ? 'All storage paths accessible' : 'Some storage paths inaccessible',
            details: results
        };
    }

    // Network connectivity check
    async checkNetwork() {
        const endpointsToCheck = [
            { name: 'Spotify API', url: 'https://api.spotify.com/v1/', timeout: 5000 },
            { name: 'External connectivity', url: 'https://httpbin.org/status/200', timeout: 5000 }
        ];

        if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('mongodb+srv://')) {
            endpointsToCheck.push({
                name: 'MongoDB Atlas',
                url: 'https://cloud.mongodb.com/',
                timeout: 5000
            });
        }

        const results = {};
        let successCount = 0;

        for (const endpoint of endpointsToCheck) {
            try {
                const startTime = Date.now();
                const response = await axios.get(endpoint.url, {
                    timeout: endpoint.timeout,
                    validateStatus: (status) => status >= 200 && status < 400
                });
                const responseTime = Date.now() - startTime;
                
                results[endpoint.name] = {
                    healthy: true,
                    status: response.status,
                    responseTime: `${responseTime}ms`
                };
                successCount++;
            } catch (error) {
                results[endpoint.name] = {
                    healthy: false,
                    error: error.message,
                    code: error.code || 'unknown'
                };
            }
        }

        const healthyPercent = (successCount / endpointsToCheck.length) * 100;

        return {
            healthy: healthyPercent >= 50, // Consider healthy if at least 50% of endpoints are reachable
            message: `${successCount}/${endpointsToCheck.length} network endpoints reachable`,
            details: {
                endpointsChecked: endpointsToCheck.length,
                successful: successCount,
                healthyPercent: Math.round(healthyPercent),
                results
            }
        };
    }
}

module.exports = HealthChecker;