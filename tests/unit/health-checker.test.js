// Health Checker Unit Tests

const HealthChecker = require('../../src/utils/health-checker');

describe('HealthChecker', () => {
    let healthChecker;

    beforeEach(() => {
        healthChecker = new HealthChecker();
    });

    describe('Basic Functionality', () => {
        test('should initialize with default checks', () => {
            expect(healthChecker.checks.size).toBeGreaterThan(0);
            expect(healthChecker.checks.has('application')).toBe(true);
            expect(healthChecker.checks.has('environment')).toBe(true);
            expect(healthChecker.checks.has('system')).toBe(true);
        });

        test('should register custom check', () => {
            const customCheck = async () => ({ healthy: true, message: 'test' });
            healthChecker.registerCheck('custom', customCheck);
            
            expect(healthChecker.checks.has('custom')).toBe(true);
        });
    });

    describe('Health Checks', () => {
        test('should run application check', async () => {
            const result = await healthChecker.runCheck('application');
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('timestamp');
            expect(['healthy', 'unhealthy', 'error']).toContain(result.status);
        });

        test('should run environment check', async () => {
            const result = await healthChecker.runCheck('environment');
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('details');
            expect(['healthy', 'unhealthy', 'error']).toContain(result.status);
        });

        test('should handle unknown check gracefully', async () => {
            const result = await healthChecker.runCheck('nonexistent');
            
            expect(result.status).toBe('error');
            expect(result.message).toContain('Unknown health check');
        });
    });

    describe('All Checks', () => {
        test('should run all checks and return summary', async () => {
            const result = await healthChecker.runAllChecks();
            
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('checks');
            expect(result).toHaveProperty('summary');
            expect(['healthy', 'degraded', 'error']).toContain(result.status);
        });
    });
});
