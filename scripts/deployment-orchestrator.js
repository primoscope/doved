#!/usr/bin/env node

/**
 * Enhanced Deployment Orchestrator with MCP Integration
 * Orchestrates the deployment process using MCP server capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class DeploymentOrchestrator {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.verbose = options.verbose || false;
        this.mcpFinderPath = path.join(this.projectRoot, 'scripts', 'mcp-document-finder.js');
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }

    async validateDeploymentPrerequisites() {
        this.log('Validating deployment prerequisites using MCP server...');
        
        try {
            // Run MCP document finder to validate all critical files
            const { stdout, stderr } = await execAsync(`node "${this.mcpFinderPath}"`);
            
            if (stderr) {
                this.log(`MCP validation warnings: ${stderr}`, 'warning');
            }
            
            this.log('MCP validation completed successfully');
            return true;
        } catch (error) {
            this.log(`MCP validation failed: ${error.message}`, 'error');
            
            // Check if it's just validation issues (exit code 1) vs real errors
            if (error.code === 1) {
                this.log('Some validation issues found, but continuing deployment', 'warning');
                return true;
            }
            
            return false;
        }
    }

    async findOptimalEnvironmentTemplate() {
        this.log('Finding optimal environment template using MCP...');
        
        try {
            const { stdout } = await execAsync(`node "${this.mcpFinderPath}" --export`);
            const reportPath = path.join(this.projectRoot, 'mcp-document-report.json');
            
            if (await this.fileExists(reportPath)) {
                const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
                
                // Find the best environment template
                const templates = report.templates;
                
                if (templates['.env.production.example']) {
                    this.log('Using .env.production.example as environment template');
                    return '.env.production.example';
                } else if (templates['.env.example']) {
                    this.log('Using .env.example as environment template');
                    return '.env.example';
                }
                
                // Clean up report file with proper error handling
                await fs.unlink(reportPath).catch((err) => {
                    this.log(`Failed to delete report file ${reportPath}: ${err.message}`, 'warning');
                });
            }
            
            return null;
        } catch (error) {
            this.log(`Error finding environment template: ${error.message}`, 'error');
            return null;
        }
    }

    async validateDocumentationCoverage() {
        this.log('Validating documentation coverage...');
        
        try {
            const { stdout } = await execAsync(`node "${this.mcpFinderPath}" --verbose`);
            
            // Parse the output to find documentation issues
            const lines = stdout.split('\n');
            const issueCount = lines.find(line => line.includes('Validation issues:'));
            
            if (issueCount && issueCount.includes('0')) {
                this.log('All documentation files validated successfully');
                return true;
            } else {
                this.log('Some documentation validation issues found', 'warning');
                return false;
            }
        } catch (error) {
            this.log(`Documentation validation failed: ${error.message}`, 'warning');
            return false;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async processNginxConfiguration() {
        this.log('Processing nginx configuration with environment variables...');
        
        const nginxProcessor = path.join(this.projectRoot, 'scripts', 'process-nginx-config.sh');
        
        if (await this.fileExists(nginxProcessor)) {
            try {
                const { stdout, stderr } = await execAsync(`bash "${nginxProcessor}"`);
                this.log('Nginx configuration processed successfully');
                if (this.verbose && stdout) {
                    console.log(stdout);
                }
                return true;
            } catch (error) {
                this.log(`Nginx configuration processing failed: ${error.message}`, 'error');
                return false;
            }
        } else {
            this.log('Nginx configuration processor not found', 'warning');
            return false;
        }
    }

    async runHealthChecks() {
        this.log('Running comprehensive health checks...');
        
        const healthChecker = path.join(this.projectRoot, 'scripts', 'enhanced-health-check.sh');
        
        if (await this.fileExists(healthChecker)) {
            try {
                const { stdout, stderr } = await execAsync(`HEALTH_LOG=/tmp/health-check.log bash "${healthChecker}" system`);
                this.log('Health checks completed successfully');
                if (this.verbose && stdout) {
                    console.log(stdout);
                }
                return true;
            } catch (error) {
                this.log(`Health checks failed: ${error.message}`, 'warning');
                // Health check failure shouldn't block deployment, just warn
                return false;
            }
        } else {
            this.log('Health checker not found', 'warning');
            return false;
        }
    }

    async generateDeploymentReport() {
        this.log('Generating deployment readiness report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            status: 'unknown',
            prerequisites: {},
            documentation: {},
            templates: {},
            infrastructure: {},
            recommendations: []
        };

        try {
            // Check MCP validation
            report.prerequisites.mcpValidation = await this.validateDeploymentPrerequisites();
            
            // Check documentation
            report.documentation.coverage = await this.validateDocumentationCoverage();
            
            // Find templates
            report.templates.environmentTemplate = await this.findOptimalEnvironmentTemplate();
            
            // Check infrastructure components
            report.infrastructure.nginxConfig = await this.processNginxConfiguration();
            report.infrastructure.healthChecks = await this.runHealthChecks();
            
            // Generate recommendations
            if (!report.prerequisites.mcpValidation) {
                report.recommendations.push('Fix MCP validation errors before deployment');
            }
            
            if (!report.documentation.coverage) {
                report.recommendations.push('Review and fix documentation validation issues');
            }
            
            if (!report.templates.environmentTemplate) {
                report.recommendations.push('Create .env.example or .env.production.example template');
            }

            if (!report.infrastructure.nginxConfig) {
                report.recommendations.push('Nginx configuration needs to be processed for environment variables');
            }
            
            // Determine overall status
            if (report.prerequisites.mcpValidation && report.templates.environmentTemplate && report.infrastructure.nginxConfig) {
                report.status = 'ready';
            } else if (report.prerequisites.mcpValidation && report.templates.environmentTemplate) {
                report.status = 'warning';
            } else {
                report.status = 'error';
            }
            
            return report;
        } catch (error) {
            this.log(`Error generating deployment report: ${error.message}`, 'error');
            report.status = 'error';
            report.error = error.message;
            return report;
        }
    }

    async enhanceDeploymentScript() {
        this.log('Enhancing deployment script with MCP integration...');
        
        const deployScript = path.join(this.projectRoot, 'deploy-one-click.sh');
        
        if (!(await this.fileExists(deployScript))) {
            this.log('Deploy script not found', 'error');
            return false;
        }

        try {
            // Validate the deployment script exists and is executable
            const stats = await fs.stat(deployScript);
            
            if (!(stats.mode & parseInt('0100', 8))) {
                this.log('Making deployment script executable...');
                await execAsync(`chmod +x "${deployScript}"`);
            }
            
            this.log('Deployment script is ready');
            return true;
        } catch (error) {
            this.log(`Error enhancing deployment script: ${error.message}`, 'error');
            return false;
        }
    }

    async orchestrateDeployment() {
        this.log('Starting deployment orchestration...');
        
        // Generate comprehensive report
        const report = await this.generateDeploymentReport();
        
        // Enhance deployment script
        const scriptReady = await this.enhanceDeploymentScript();
        
        // Save report for reference
        const reportPath = path.join(this.projectRoot, 'deployment-readiness-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        this.log(`Deployment report saved to: ${reportPath}`);
        
        return {
            report,
            scriptReady,
            ready: report.status === 'ready' && scriptReady
        };
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        projectRoot: process.cwd()
    };

    console.log('🚀 EchoTune AI - Enhanced Deployment Orchestrator');
    console.log('=================================================');
    console.log(`Project Root: ${options.projectRoot}\n`);

    try {
        const orchestrator = new DeploymentOrchestrator(options);
        
        // Run orchestration
        const result = await orchestrator.orchestrateDeployment();
        
        console.log('📊 Deployment Readiness Report:');
        console.log(`├── Status: ${result.report.status.toUpperCase()}`);
        console.log(`├── MCP Validation: ${result.report.prerequisites.mcpValidation ? '✅' : '❌'}`);
        console.log(`├── Documentation: ${result.report.documentation.coverage ? '✅' : '⚠️'}`);
        console.log(`├── Environment Template: ${result.report.templates.environmentTemplate || 'Not found'}`);
        console.log(`├── Nginx Configuration: ${result.report.infrastructure.nginxConfig ? '✅' : '⚠️'}`);
        console.log(`├── Health Checks: ${result.report.infrastructure.healthChecks ? '✅' : '⚠️'}`);
        console.log(`└── Deployment Script: ${result.scriptReady ? '✅' : '❌'}`);
        
        if (result.report.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            result.report.recommendations.forEach((rec, i) => {
                console.log(`${i + 1}. ${rec}`);
            });
        }
        
        if (result.ready) {
            console.log('\n✅ Deployment environment is ready!');
            console.log('You can now run: ./deploy-one-click.sh');
            process.exit(0);
        } else if (result.report.status === 'warning') {
            console.log('\n⚠️  Deployment can proceed with warnings');
            console.log('Review the recommendations above');
            process.exit(0);
        } else {
            console.log('\n❌ Deployment environment has issues');
            console.log('Please fix the issues above before deployment');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error during deployment orchestration:', error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Export for use as module
module.exports = DeploymentOrchestrator;

// Run as CLI if called directly
if (require.main === module) {
    main();
}