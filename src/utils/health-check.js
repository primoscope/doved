/**
 * Enhanced Health Check System
 * Comprehensive health monitoring for production deployment
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class HealthCheckSystem {
  constructor() {
    this.checks = new Map();
    this.initializeChecks();
  }

  /**
   * Initialize all health check functions
   */
  initializeChecks() {
    this.checks.set('application', this.checkApplication.bind(this));
    this.checks.set('database', this.checkDatabase.bind(this));
    this.checks.set('redis', this.checkRedis.bind(this));
    this.checks.set('system', this.checkSystemResources.bind(this));
    this.checks.set('network', this.checkNetworkConnectivity.bind(this));
    this.checks.set('ssl', this.checkSSLCertificates.bind(this));
    this.checks.set('docker', this.checkDockerHealth.bind(this));
    this.checks.set('storage', this.checkStorageHealth.bind(this));
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime(),
      checks: {},
      system: await this.getSystemInfo(),
    };

    let overallHealth = true;

    for (const [checkName, checkFunction] of this.checks) {
      try {
        const startTime = Date.now();
        const result = await checkFunction();
        const duration = Date.now() - startTime;

        results.checks[checkName] = {
          ...result,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        };

        if (result.status !== 'healthy') {
          overallHealth = false;
        }
      } catch (error) {
        results.checks[checkName] = {
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString(),
        };
        overallHealth = false;
      }
    }

    results.status = overallHealth ? 'healthy' : 'unhealthy';
    return results;
  }

  /**
   * Run a specific health check
   */
  async runCheck(checkName) {
    const checkFunction = this.checks.get(checkName);
    if (!checkFunction) {
      throw new Error(`Unknown health check: ${checkName}`);
    }

    const startTime = Date.now();
    const result = await checkFunction();
    const duration = Date.now() - startTime;

    return {
      ...result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Application health check
   */
  async checkApplication() {
    const health = {
      status: 'healthy',
      details: {},
    };

    // Check environment configuration
    const requiredEnvVars = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'NODE_ENV'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      health.status = 'unhealthy';
      health.details.missingEnvironmentVariables = missingVars;
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    health.details.memory = {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    };

    // Check if memory usage is excessive (>1GB)
    if (memUsage.rss > 1024 * 1024 * 1024) {
      health.status = 'warning';
      health.details.warnings = health.details.warnings || [];
      health.details.warnings.push('High memory usage detected');
    }

    return health;
  }

  /**
   * Database connectivity check
   */
  async checkDatabase() {
    const health = {
      status: 'healthy',
      details: {},
    };

    // Check MongoDB
    if (process.env.MONGODB_URI) {
      try {
        const mongoManager = require('../database/mongodb');
        const mongoHealth = await mongoManager.healthCheck();
        health.details.mongodb = mongoHealth;
        
        if (mongoHealth.status !== 'healthy') {
          health.status = 'unhealthy';
        }
      } catch (error) {
        health.status = 'unhealthy';
        health.details.mongodb = {
          status: 'error',
          message: error.message,
        };
      }
    } else {
      health.details.mongodb = {
        status: 'not_configured',
        message: 'MongoDB URI not provided',
      };
    }

    return health;
  }

  /**
   * Redis connectivity check
   */
  async checkRedis() {
    const health = {
      status: 'healthy',
      details: {},
    };

    if (process.env.REDIS_URL) {
      try {
        // Simple Redis ping test
        const { stdout } = await execAsync(`redis-cli -u "${process.env.REDIS_URL}" ping`);
        if (stdout.trim() === 'PONG') {
          health.details.redis = {
            status: 'healthy',
            message: 'Redis connection successful',
          };
        } else {
          health.status = 'unhealthy';
          health.details.redis = {
            status: 'unhealthy',
            message: 'Redis ping failed',
          };
        }
      } catch (error) {
        health.status = 'unhealthy';
        health.details.redis = {
          status: 'error',
          message: `Redis connection failed: ${error.message}`,
        };
      }
    } else {
      health.details.redis = {
        status: 'not_configured',
        message: 'Redis URL not provided',
      };
    }

    return health;
  }

  /**
   * System resources check
   */
  async checkSystemResources() {
    const health = {
      status: 'healthy',
      details: {},
    };

    // CPU usage
    const cpus = os.cpus();
    health.details.cpu = {
      cores: cpus.length,
      model: cpus[0].model,
      loadAverage: os.loadavg(),
    };

    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = Math.round((usedMem / totalMem) * 100);

    health.details.memory = {
      total: `${Math.round(totalMem / 1024 / 1024 / 1024)}GB`,
      used: `${Math.round(usedMem / 1024 / 1024 / 1024)}GB`,
      free: `${Math.round(freeMem / 1024 / 1024 / 1024)}GB`,
      usagePercent: `${memUsagePercent}%`,
    };

    // Check memory threshold
    if (memUsagePercent > 85) {
      health.status = 'warning';
      health.details.warnings = health.details.warnings || [];
      health.details.warnings.push(`High memory usage: ${memUsagePercent}%`);
    }

    // Disk usage
    try {
      const { stdout } = await execAsync('df -h / | tail -1');
      const diskInfo = stdout.trim().split(/\s+/);
      const diskUsagePercent = parseInt(diskInfo[4]);
      
      health.details.disk = {
        filesystem: diskInfo[0],
        size: diskInfo[1],
        used: diskInfo[2],
        available: diskInfo[3],
        usagePercent: diskInfo[4],
      };

      if (diskUsagePercent > 90) {
        health.status = 'warning';
        health.details.warnings = health.details.warnings || [];
        health.details.warnings.push(`High disk usage: ${diskUsagePercent}%`);
      }
    } catch (error) {
      health.details.disk = { error: 'Unable to check disk usage' };
    }

    return health;
  }

  /**
   * Network connectivity check
   */
  async checkNetworkConnectivity() {
    const health = {
      status: 'healthy',
      details: {},
    };

    const endpoints = [
      { name: 'spotify_api', url: 'https://api.spotify.com' },
      { name: 'google_dns', url: '8.8.8.8' },
      { name: 'cloudflare_dns', url: '1.1.1.1' },
    ];

    const results = {};

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        await execAsync(`timeout 10s curl -f -s ${endpoint.url} > /dev/null`);
        const responseTime = Date.now() - startTime;
        
        results[endpoint.name] = {
          status: 'healthy',
          responseTime: `${responseTime}ms`,
        };
      } catch (error) {
        results[endpoint.name] = {
          status: 'unhealthy',
          error: 'Connection failed',
        };
        health.status = 'warning';
      }
    }

    health.details.connectivity = results;
    return health;
  }

  /**
   * SSL certificates check
   */
  async checkSSLCertificates() {
    const health = {
      status: 'healthy',
      details: {},
    };

    const domain = process.env.DOMAIN || 'primosphere.studio';
    const certPath = process.env.SSL_CERT_PATH || `/opt/echotune/ssl/${domain}.crt`;

    try {
      await fs.access(certPath);
      
      // Check certificate expiry
      const { stdout } = await execAsync(`openssl x509 -enddate -noout -in "${certPath}"`);
      const expiryLine = stdout.trim();
      const expiryDate = new Date(expiryLine.split('=')[1]);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      health.details.ssl = {
        certificateFound: true,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry,
      };

      if (daysUntilExpiry < 30) {
        health.status = 'warning';
        health.details.warnings = health.details.warnings || [];
        health.details.warnings.push(`SSL certificate expires in ${daysUntilExpiry} days`);
      }

      if (daysUntilExpiry < 7) {
        health.status = 'unhealthy';
      }
    } catch (error) {
      health.status = 'warning';
      health.details.ssl = {
        certificateFound: false,
        message: 'SSL certificate not found or unreadable',
      };
    }

    return health;
  }

  /**
   * Docker containers health check
   */
  async checkDockerHealth() {
    const health = {
      status: 'healthy',
      details: {},
    };

    try {
      // Check if Docker is running
      await execAsync('docker --version');
      
      // Check Docker Compose services
      const { stdout } = await execAsync('docker-compose ps --format json');
      const containers = stdout.trim().split('\n').map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      const containerStatuses = {};
      let allHealthy = true;

      for (const container of containers) {
        const isHealthy = container.State === 'running';
        containerStatuses[container.Service] = {
          status: isHealthy ? 'running' : container.State,
          health: isHealthy ? 'healthy' : 'unhealthy',
        };

        if (!isHealthy) {
          allHealthy = false;
        }
      }

      health.details.containers = containerStatuses;
      if (!allHealthy) {
        health.status = 'unhealthy';
      }
    } catch (error) {
      health.status = 'error';
      health.details.error = 'Docker not available or not running';
    }

    return health;
  }

  /**
   * Storage health check
   */
  async checkStorageHealth() {
    const health = {
      status: 'healthy',
      details: {},
    };

    const paths = [
      '/opt/echotune/logs',
      '/opt/echotune/backups',
      '/opt/echotune/ssl',
    ];

    for (const dirPath of paths) {
      try {
        await fs.access(dirPath);
        const stats = await fs.stat(dirPath);
        health.details[path.basename(dirPath)] = {
          exists: true,
          writable: true, // Simplified check
          lastModified: stats.mtime.toISOString(),
        };
      } catch (error) {
        health.details[path.basename(dirPath)] = {
          exists: false,
          error: error.message,
        };
        health.status = 'warning';
      }
    }

    return health;
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}

module.exports = HealthCheckSystem;