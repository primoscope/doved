/**
 * @fileoverview MCP Servers Integration Tests
 * Tests the functionality and integration of all MCP servers
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('MCP Servers Integration', () => {
    const timeout = 30000;
    const projectRoot = path.join(__dirname, '../..');
    
    beforeAll(() => {
        // Ensure all required files exist
        expect(fs.existsSync(path.join(projectRoot, 'scripts/mcp-manager.js'))).toBe(true);
    });

    describe('MCP Manager Script', () => {
        test('should show help when no arguments provided', (done) => {
            exec('node scripts/mcp-manager.js', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(stdout).toContain('MCP Server Management');
                expect(stdout).toContain('Usage:');
                expect(stdout).toContain('Commands:');
                done();
            });
        }, timeout);

        test('should perform health check', (done) => {
            exec('node scripts/mcp-manager.js health', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(stdout).toContain('Running MCP servers health check');
                expect(stdout).toMatch(/✅|❌/); // Should have status indicators
                done();
            });
        }, timeout);

        test('should generate report', (done) => {
            exec('node scripts/mcp-manager.js report', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(stdout).toContain('Generating MCP servers report');
                expect(stdout).toContain('Report saved to:');
                
                // Check if report file was created
                const reportPath = path.join(projectRoot, 'mcp-servers-report.json');
                setTimeout(() => {
                    expect(fs.existsSync(reportPath)).toBe(true);
                    
                    // Validate report content
                    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                    expect(report).toHaveProperty('timestamp');
                    expect(report).toHaveProperty('project', 'EchoTune AI');
                    expect(report).toHaveProperty('servers');
                    expect(Object.keys(report.servers)).toContain('sequential-thinking');
                    expect(Object.keys(report.servers)).toContain('screenshot-website');
                    
                    done();
                }, 1000);
            });
        }, timeout);

        test('should check system dependencies', (done) => {
            exec('node scripts/mcp-manager.js check', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(stdout).toContain('Checking MCP server dependencies');
                expect(stdout).toContain('Node.js:');
                expect(stdout).toContain('MCP Dependencies:');
                done();
            });
        }, timeout);
    });

    describe('Individual MCP Servers', () => {
        test('Sequential Thinking server should be properly installed', () => {
            const serverPath = path.join(projectRoot, 'mcp-servers/sequential-thinking');
            expect(fs.existsSync(serverPath)).toBe(true);
            expect(fs.existsSync(path.join(serverPath, 'package.json'))).toBe(true);
            expect(fs.existsSync(path.join(serverPath, 'dist/index.js'))).toBe(true);
        });

        test('Screenshot Website server should be properly installed', () => {
            const serverPath = path.join(projectRoot, 'mcp-servers/screenshot-website');
            expect(fs.existsSync(serverPath)).toBe(true);
            expect(fs.existsSync(path.join(serverPath, 'package.json'))).toBe(true);
            expect(fs.existsSync(path.join(serverPath, 'index.js'))).toBe(true);
        });

        test('Package.json should include MCP server configurations', () => {
            const packageJsonPath = path.join(projectRoot, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            expect(packageJson).toHaveProperty('mcp');
            expect(packageJson.mcp).toHaveProperty('servers');
            
            const servers = packageJson.mcp.servers;
            expect(servers).toHaveProperty('sequential-thinking');
            expect(servers).toHaveProperty('screenshot-website');
            expect(servers).toHaveProperty('browserbase');
            expect(servers).toHaveProperty('filesystem');
            
            // Check server configurations
            expect(servers['sequential-thinking']).toHaveProperty('command', 'node');
            expect(servers['sequential-thinking'].args).toContain('mcp-servers/sequential-thinking/dist/index.js');
            
            expect(servers['screenshot-website']).toHaveProperty('command', 'node');
            expect(servers['screenshot-website'].args).toContain('mcp-servers/screenshot-website/dist/index.js');
        });

        test('Package.json should include MCP management scripts', () => {
            const packageJsonPath = path.join(projectRoot, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            expect(packageJson.scripts).toHaveProperty('mcp-manage');
            expect(packageJson.scripts).toHaveProperty('mcp-install');
            expect(packageJson.scripts).toHaveProperty('mcp-test-all');
            expect(packageJson.scripts).toHaveProperty('mcp-health');
            expect(packageJson.scripts).toHaveProperty('mcp-report');
        });
    });

    describe('Environment Configuration', () => {
        test('.env.example should include MCP environment variables', () => {
            const envExamplePath = path.join(projectRoot, '.env.example');
            const envExample = fs.readFileSync(envExamplePath, 'utf8');
            
            expect(envExample).toContain('BROWSERBASE_API_KEY');
            expect(envExample).toContain('BROWSERBASE_PROJECT_ID');
            expect(envExample).toContain('MCP_SEQUENTIAL_THINKING_ENABLED');
            expect(envExample).toContain('MCP_SCREENSHOT_WEBSITE_ENABLED');
            expect(envExample).toContain('MCP_BROWSERBASE_ENABLED');
            expect(envExample).toContain('MCP_FILESYSTEM_ENABLED');
        });
    });

    describe('Server Installation Tests', () => {
        test('should be able to test individual servers', (done) => {
            exec('node scripts/mcp-manager.js test sequential-thinking', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(stdout).toContain('Testing Sequential Thinking');
                // Server might fail to start without proper setup, but script should handle it gracefully
                done();
            });
        }, timeout);

        test('should handle missing servers gracefully', (done) => {
            exec('node scripts/mcp-manager.js test non-existent-server', { cwd: projectRoot }, (error, stdout, stderr) => {
                expect(error).toBeTruthy();
                expect(stderr || stdout).toContain('Unknown server');
                done();
            });
        }, timeout);
    });

    afterAll(() => {
        // Cleanup report file if it exists
        const reportPath = path.join(projectRoot, 'mcp-servers-report.json');
        if (fs.existsSync(reportPath)) {
            fs.unlinkSync(reportPath);
        }
    });
});