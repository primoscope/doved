#!/usr/bin/env node

/**
 * MCP Server Management Script
 * Manages installation, configuration, and testing of all MCP servers
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class MCPServerManager {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.mcpServersDir = path.join(this.projectRoot, 'mcp-servers');
        this.servers = {
            'sequential-thinking': {
                name: 'Sequential Thinking',
                path: this.mcpServersDir,
                command: 'node',
                args: ['sequential-thinking/dist/index.js'],
                health: 'ready',
                description: 'Structured thinking and reasoning capabilities'
            },
            'screenshot-website': {
                name: 'Screenshot Website Fast', 
                path: this.mcpServersDir,
                command: 'node',
                args: ['screenshot-website/index.js'],
                health: 'ready',
                description: 'Fast website screenshot capabilities'
            },
            'browserbase': {
                name: 'Browserbase',
                path: this.projectRoot,
                command: 'npx',
                args: ['@browserbasehq/mcp-server-browserbase'],
                health: 'ready',
                env: {
                    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY || '',
                    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID || ''
                },
                description: 'Cloud browser automation'
            },
            'filesystem': {
                name: 'Enhanced File Utilities',
                path: this.projectRoot,
                command: 'node',
                args: ['mcp-servers/enhanced-file-utilities.js'],
                health: 'ready',
                env: {
                    ALLOWED_DIRECTORIES: `${this.projectRoot},${this.projectRoot}/src,${this.projectRoot}/scripts,${this.projectRoot}/mcp-server`
                },
                description: 'Enhanced file system operations with security and validation'
            }
        };
    }

    async checkDependencies() {
        console.log('🔍 Checking MCP server dependencies...');
        
        try {
            // Check Node.js
            const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
            console.log(`✅ Node.js: ${nodeVersion}`);
            
            // Check npm packages
            const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
            const mcpDeps = Object.keys(packageJson.dependencies || {}).filter(dep => 
                dep.includes('mcp') || dep.includes('FileScopeMCP') || dep.includes('browserbase')
            );
            
            console.log(`✅ MCP Dependencies: ${mcpDeps.join(', ')}`);
            
            return true;
        } catch (error) {
            console.error('❌ Dependency check failed:', error.message);
            return false;
        }
    }

    async installServer(serverName) {
        const server = this.servers[serverName];
        if (!server) {
            throw new Error(`Unknown server: ${serverName}`);
        }

        console.log(`📦 Installing ${server.name}...`);
        
        try {
            if (fs.existsSync(path.join(server.path, 'package.json'))) {
                process.chdir(server.path);
                execSync('npm install', { stdio: 'inherit' });
                
                // Try to build if build script exists
                const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                if (packageJson.scripts && packageJson.scripts.build) {
                    console.log(`🔨 Building ${server.name}...`);
                    execSync('npm run build', { stdio: 'inherit' });
                }
            }
            
            console.log(`✅ ${server.name} installed successfully`);
        } catch (error) {
            console.error(`❌ Failed to install ${server.name}:`, error.message);
            throw error;
        }
    }

    async testServer(serverName, timeout = 5000) {
        const server = this.servers[serverName];
        if (!server) {
            throw new Error(`Unknown server: ${serverName}`);
        }

        console.log(`🧪 Testing ${server.name}...`);
        
        return new Promise((resolve, reject) => {
            const cwd = server.path;
            const env = { ...process.env, ...server.env };
            
            const child = exec(`${server.command} ${server.args.join(' ')}`, { cwd, env }, (error, stdout, stderr) => {
                if (error && !error.killed) {
                    console.error(`❌ ${server.name} test failed:`, error.message);
                    reject(error);
                } else {
                    console.log(`✅ ${server.name} started successfully`);
                    resolve(true);
                }
            });

            // Kill the process after timeout
            setTimeout(() => {
                child.kill();
                resolve(true);
            }, timeout);

            child.stdout?.on('data', (data) => {
                if (data.includes('listening') || data.includes('ready') || data.includes('started')) {
                    console.log(`✅ ${server.name} is ready`);
                    child.kill();
                    resolve(true);
                }
            });
        });
    }

    async healthCheck() {
        console.log('🏥 Running MCP servers health check...');
        
        const results = {};
        
        for (const [serverName, server] of Object.entries(this.servers)) {
            try {
                // Check if server files exist
                let exists = false;
                if (server.command === 'npx') {
                    exists = true; // npm packages are installed globally
                } else if (server.args[0].includes('node_modules')) {
                    exists = fs.existsSync(path.join(server.path, server.args[0]));
                } else {
                    exists = fs.existsSync(path.join(server.path, server.args[0]));
                }
                
                results[serverName] = {
                    name: server.name,
                    exists,
                    description: server.description,
                    status: exists ? 'installed' : 'missing'
                };
                
                console.log(`${exists ? '✅' : '❌'} ${server.name}: ${results[serverName].status}`);
            } catch (error) {
                results[serverName] = {
                    name: server.name,
                    exists: false,
                    description: server.description,
                    status: 'error',
                    error: error.message
                };
                console.log(`❌ ${server.name}: error - ${error.message}`);
            }
        }
        
        return results;
    }

    async generateReport() {
        console.log('\n📊 Generating MCP servers report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            project: 'EchoTune AI',
            servers: {}
        };

        for (const [serverName, server] of Object.entries(this.servers)) {
            const serverPath = server.path;
            const packageJsonPath = path.join(serverPath, 'package.json');
            
            let version = 'unknown';
            let dependencies = [];
            
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    version = packageJson.version || 'unknown';
                    dependencies = Object.keys(packageJson.dependencies || {});
                } catch (error) {
                    // Ignore parsing errors
                }
            }
            
            report.servers[serverName] = {
                name: server.name,
                description: server.description,
                version,
                command: `${server.command} ${server.args.join(' ')}`,
                path: serverPath,
                dependencies: dependencies.length,
                environmentVariables: Object.keys(server.env || {})
            };
        }

        const reportPath = path.join(this.projectRoot, 'mcp-servers-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`📄 Report saved to: ${reportPath}`);
        return report;
    }

    async main() {
        const args = process.argv.slice(2);
        const command = args[0];
        const serverName = args[1];

        try {
            switch (command) {
                case 'install':
                    if (serverName) {
                        await this.installServer(serverName);
                    } else {
                        console.log('📦 Installing all MCP servers...');
                        for (const name of Object.keys(this.servers)) {
                            await this.installServer(name);
                        }
                    }
                    break;

                case 'test':
                    if (serverName) {
                        await this.testServer(serverName);
                    } else {
                        console.log('🧪 Testing all MCP servers...');
                        for (const name of Object.keys(this.servers)) {
                            try {
                                await this.testServer(name);
                            } catch (error) {
                                console.error(`Test failed for ${name}:`, error.message);
                            }
                        }
                    }
                    break;

                case 'health':
                    await this.healthCheck();
                    break;

                case 'report':
                    await this.generateReport();
                    break;

                case 'check':
                    await this.checkDependencies();
                    break;

                default:
                    console.log(`
🤖 EchoTune AI - MCP Server Management

Usage: node mcp-manager.js <command> [server-name]

Commands:
  install [server]    Install MCP server(s)
  test [server]       Test MCP server(s)
  health             Check health of all servers
  report             Generate detailed report
  check              Check system dependencies

Available servers: ${Object.keys(this.servers).join(', ')}

Examples:
  node mcp-manager.js install                    # Install all servers
  node mcp-manager.js install sequential-thinking  # Install specific server
  node mcp-manager.js test                       # Test all servers
  node mcp-manager.js health                     # Health check
  node mcp-manager.js report                     # Generate report
                    `);
            }
        } catch (error) {
            console.error('❌ Command failed:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const manager = new MCPServerManager();
    manager.main();
}

module.exports = MCPServerManager;