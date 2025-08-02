// Deployment Integration Tests for EchoTune AI

const axios = require('axios');
const { spawn } = require('child_process');

describe('Deployment Integration Tests', () => {
    const baseURL = process.env.TEST_URL || 'http://localhost:3000';
    const timeout = 45000; // Increased timeout
    let serverProcess = null;

    beforeAll(async () => {
        // Check if server is already running
        try {
            await axios.get(`${baseURL}/alive`, { timeout: 2000 });
            console.log('Server already running');
        } catch (error) {
            // Start the server if not running
            console.log('Starting server for tests...');
            serverProcess = spawn('npm', ['start'], {
                cwd: process.cwd(),
                stdio: 'pipe'
            });
            
            // Wait for server to start
            await waitForApp(baseURL, timeout);
        }
    }, timeout);

    afterAll(async () => {
        // Clean up if we started the server
        if (serverProcess) {
            console.log('Stopping test server...');
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    });

    describe('Health Endpoints', () => {
        test('GET /health should return comprehensive health status', async () => {
            const response = await axios.get(`${baseURL}/health`);
            
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('timestamp');
            expect(response.data).toHaveProperty('checks');
            expect(response.data.checks).toHaveProperty('application');
            expect(response.data.checks).toHaveProperty('environment');
        });

        test('GET /ready should return readiness status', async () => {
            const response = await axios.get(`${baseURL}/ready`);
            
            expect([200, 503]).toContain(response.status);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('timestamp');
        });

        test('GET /alive should return liveness status', async () => {
            const response = await axios.get(`${baseURL}/alive`);
            
            expect([200, 503]).toContain(response.status);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('uptime');
        });
    });

    describe('Application Endpoints', () => {
        test('GET / should return main application', async () => {
            const response = await axios.get(baseURL);
            
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/html/);
        });

        test('GET /api/chat should be accessible', async () => {
            const response = await axios.get(`${baseURL}/api/chat`, {
                validateStatus: () => true // Accept any status code
            });
            
            // Should not return 404
            expect(response.status).not.toBe(404);
        });
    });

    describe('Security Headers', () => {
        test('Should include security headers', async () => {
            const response = await axios.get(baseURL);
            
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });
    });

    describe('Performance', () => {
        test('Health endpoint should respond quickly', async () => {
            const startTime = Date.now();
            await axios.get(`${baseURL}/health`);
            const responseTime = Date.now() - startTime;
            
            expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
        });
    });
});

async function waitForApp(url, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            await axios.get(`${url}/alive`, { timeout: 2000 });
            return;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`Application did not become ready within ${timeout}ms`);
}
