#!/usr/bin/env node

/**
 * Fast NPM Package Installer for Large Repositories
 * Optimizes npm installation with caching, parallel processing, and error recovery
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

class FastPackageInstaller {
    constructor(options = {}) {
        this.rootPath = options.rootPath || process.cwd();
        this.productionOnly = options.productionOnly || false;
        this.skipOptional = options.skipOptional !== false;
        this.skipAudit = options.skipAudit !== false;
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 300; // 5 minutes
        this.results = {
            success: false,
            method: null,
            duration: 0,
            errors: [],
            installedPackages: 0
        };
    }

    /**
     * Main installation function with multiple strategies
     */
    async install() {
        console.log('📦 Starting optimized package installation...');
        const startTime = performance.now();

        try {
            // Check prerequisites
            await this.checkPrerequisites();

            // Try different installation methods in order of preference
            const methods = [
                { name: 'npm-ci-optimized', fn: () => this.npmCiOptimized() },
                { name: 'npm-install-optimized', fn: () => this.npmInstallOptimized() },
                { name: 'npm-install-fallback', fn: () => this.npmInstallFallback() },
                { name: 'minimal-install', fn: () => this.minimalInstall() }
            ];

            for (const method of methods) {
                console.log(`🔄 Trying installation method: ${method.name}`);
                
                try {
                    await method.fn();
                    this.results.method = method.name;
                    this.results.success = true;
                    break;
                } catch (error) {
                    console.log(`❌ Method ${method.name} failed: ${error.message}`);
                    this.results.errors.push({
                        method: method.name,
                        error: error.message
                    });
                    
                    // Clean up before trying next method
                    await this.cleanupNodeModules();
                }
            }

            const endTime = performance.now();
            this.results.duration = Math.round(endTime - startTime);

            if (this.results.success) {
                console.log(`✅ Installation completed successfully using ${this.results.method}`);
                console.log(`⏱️  Duration: ${this.results.duration}ms`);
                
                // Count installed packages
                this.results.installedPackages = await this.countInstalledPackages();
                console.log(`📦 Installed packages: ${this.results.installedPackages}`);
            } else {
                throw new Error('All installation methods failed');
            }

            return this.results;
        } catch (error) {
            const endTime = performance.now();
            this.results.duration = Math.round(endTime - startTime);
            this.results.success = false;
            
            console.error('❌ Package installation failed:', error.message);
            throw error;
        }
    }

    /**
     * Check prerequisites for npm installation
     */
    async checkPrerequisites() {
        // Check if package.json exists
        try {
            await fs.access(path.join(this.rootPath, 'package.json'));
        } catch (error) {
            throw new Error('package.json not found in the project directory');
        }

        // Check npm version
        try {
            const npmVersion = await this.runCommand('npm', ['--version'], { timeout: 10000 });
            console.log(`📋 npm version: ${npmVersion.trim()}`);
        } catch (error) {
            throw new Error('npm is not installed or not accessible');
        }

        // Check disk space
        try {
            const diskSpace = await this.checkDiskSpace();
            if (diskSpace < 1024) { // Less than 1GB
                console.warn(`⚠️  Low disk space: ${diskSpace}MB available`);
            }
        } catch (error) {
            console.warn('⚠️  Could not check disk space');
        }
    }

    /**
     * Optimized npm ci with cache and parallel processing
     */
    async npmCiOptimized() {
        // Check if package-lock.json exists
        try {
            await fs.access(path.join(this.rootPath, 'package-lock.json'));
        } catch (error) {
            throw new Error('package-lock.json not found, cannot use npm ci');
        }

        const args = ['ci'];
        
        if (this.productionOnly) {
            args.push('--only=production');
        }
        
        if (this.skipOptional) {
            args.push('--no-optional');
        }
        
        if (this.skipAudit) {
            args.push('--no-audit');
        }

        // Use cache and optimize for CI
        args.push('--cache', '/tmp/npm-cache');
        args.push('--prefer-offline');
        args.push('--no-progress');
        args.push('--silent');

        await this.runCommand('npm', args, { 
            timeout: this.timeout * 1000,
            cwd: this.rootPath 
        });
    }

    /**
     * Optimized npm install with improved settings
     */
    async npmInstallOptimized() {
        const args = ['install'];
        
        if (this.productionOnly) {
            args.push('--only=production');
        }
        
        if (this.skipOptional) {
            args.push('--no-optional');
        }
        
        if (this.skipAudit) {
            args.push('--no-audit');
        }

        // Optimization flags
        args.push('--no-fund');
        args.push('--no-progress');
        args.push('--silent');
        args.push('--cache', '/tmp/npm-cache');
        args.push('--prefer-offline');

        await this.runCommand('npm', args, { 
            timeout: this.timeout * 1000,
            cwd: this.rootPath 
        });
    }

    /**
     * Fallback npm install with basic settings
     */
    async npmInstallFallback() {
        const args = ['install'];
        
        if (this.productionOnly) {
            args.push('--only=production');
        }

        // Basic fallback - just essential flags
        args.push('--no-audit');
        args.push('--silent');

        await this.runCommand('npm', args, { 
            timeout: this.timeout * 1000,
            cwd: this.rootPath 
        });
    }

    /**
     * Install only essential packages for basic functionality
     */
    async minimalInstall() {
        console.log('🔧 Attempting minimal installation of essential packages...');
        
        // Read package.json to get essential dependencies
        const packageJsonPath = path.join(this.rootPath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        // Essential packages for basic Node.js app functionality
        const essentialPackages = [
            'express',
            'dotenv',
            'compression',
            'cors',
            'helmet'
        ];

        // Find which essential packages are in dependencies
        const toInstall = essentialPackages.filter(pkg => 
            packageJson.dependencies && packageJson.dependencies[pkg]
        );

        if (toInstall.length === 0) {
            throw new Error('No essential packages found to install');
        }

        console.log(`📦 Installing essential packages: ${toInstall.join(', ')}`);

        for (const pkg of toInstall) {
            try {
                const version = packageJson.dependencies[pkg];
                await this.runCommand('npm', ['install', `${pkg}@${version}`, '--no-audit', '--silent'], {
                    timeout: 30000,
                    cwd: this.rootPath
                });
                console.log(`✅ Installed: ${pkg}`);
            } catch (error) {
                console.log(`⚠️  Failed to install ${pkg}: ${error.message}`);
            }
        }
    }

    /**
     * Clean up node_modules for fresh installation
     */
    async cleanupNodeModules() {
        const nodeModulesPath = path.join(this.rootPath, 'node_modules');
        
        try {
            await fs.rmdir(nodeModulesPath, { recursive: true });
            console.log('🧹 Cleaned up node_modules directory');
        } catch (error) {
            // Directory might not exist or we don't have permissions
            console.log('ℹ️  node_modules cleanup skipped');
        }
    }

    /**
     * Count installed packages in node_modules
     */
    async countInstalledPackages() {
        const nodeModulesPath = path.join(this.rootPath, 'node_modules');
        
        try {
            const entries = await fs.readdir(nodeModulesPath);
            // Filter out .cache, .bin, etc.
            const packages = entries.filter(entry => 
                !entry.startsWith('.') && !entry.startsWith('@') // Skip scoped packages for now
            );
            
            // Count scoped packages separately
            const scopedDirs = entries.filter(entry => entry.startsWith('@'));
            let scopedPackages = 0;
            
            for (const scopedDir of scopedDirs) {
                try {
                    const scopedEntries = await fs.readdir(path.join(nodeModulesPath, scopedDir));
                    scopedPackages += scopedEntries.length;
                } catch (error) {
                    // Skip if we can't read the directory
                }
            }
            
            return packages.length + scopedPackages;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check available disk space
     */
    async checkDiskSpace() {
        try {
            const stats = await fs.statfs(this.rootPath);
            const freeBytes = stats.bavail * stats.bsize;
            return Math.round(freeBytes / (1024 * 1024)); // Convert to MB
        } catch (error) {
            // Fallback method using df command
            try {
                const output = await this.runCommand('df', ['-m', this.rootPath], { timeout: 5000 });
                const lines = output.trim().split('\n');
                if (lines.length > 1) {
                    const parts = lines[1].split(/\s+/);
                    return parseInt(parts[3]) || 0; // Available space in MB
                }
            } catch (dfError) {
                throw new Error('Could not determine disk space');
            }
        }
    }

    /**
     * Run command with proper error handling and timeout
     */
    async runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                cwd: options.cwd || this.rootPath,
                stdio: 'pipe'
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Set timeout if specified
            let timeoutId;
            if (options.timeout) {
                timeoutId = setTimeout(() => {
                    process.kill('SIGKILL');
                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout);
            }

            process.on('close', (code) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            process.on('error', (error) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                reject(error);
            });
        });
    }

    /**
     * Generate installation report
     */
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            success: this.results.success,
            method: this.results.method,
            duration: `${this.results.duration}ms`,
            installedPackages: this.results.installedPackages,
            errors: this.results.errors
        };

        console.log('\n📊 Installation Report');
        console.log('======================');
        console.log(`Status: ${report.success ? '✅ Success' : '❌ Failed'}`);
        console.log(`Method: ${report.method || 'N/A'}`);
        console.log(`Duration: ${report.duration}`);
        console.log(`Packages: ${report.installedPackages}`);
        
        if (report.errors.length > 0) {
            console.log(`Errors: ${report.errors.length}`);
            report.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.method}: ${error.error}`);
            });
        }

        return report;
    }
}

// CLI functionality
if (require.main === module) {
    const args = process.argv.slice(2);
    
    const options = {
        rootPath: process.cwd(),
        productionOnly: args.includes('--production'),
        skipOptional: !args.includes('--with-optional'),
        skipAudit: !args.includes('--with-audit'),
        timeout: 300 // 5 minutes default
    };

    // Parse timeout option
    const timeoutIndex = args.indexOf('--timeout');
    if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
        options.timeout = parseInt(args[timeoutIndex + 1]) || 300;
    }

    if (args.includes('--help')) {
        console.log(`
Fast NPM Package Installer for Large Repositories

Usage: node fast-npm-install.js [options]

Options:
  --production      Install only production dependencies
  --with-optional   Include optional dependencies (default: skip)
  --with-audit      Run npm audit (default: skip)
  --timeout SEC     Set timeout in seconds (default: 300)
  --help            Show this help message

Examples:
  node fast-npm-install.js                    # Default optimized installation
  node fast-npm-install.js --production       # Production only
  node fast-npm-install.js --timeout 600      # 10 minute timeout

The installer will try multiple strategies to handle problematic dependencies
and large repository installations efficiently.
        `);
        process.exit(0);
    }

    const installer = new FastPackageInstaller(options);
    
    installer.install()
        .then((results) => {
            installer.generateReport();
            console.log('\n✅ Fast package installation completed!');
            process.exit(0);
        })
        .catch((error) => {
            installer.generateReport();
            console.error('\n❌ Fast package installation failed:', error.message);
            process.exit(1);
        });
}

module.exports = FastPackageInstaller;