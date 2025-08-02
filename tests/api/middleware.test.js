/**
 * Tests for API middleware
 */

const { requestLogger, errorHandler, corsMiddleware, createRateLimit } = require('../../src/api/middleware/index');

describe('API Middleware', () => {
  
  describe('requestLogger', () => {
    test('should log request details', (done) => {
      const req = global.testHelpers.createMockRequest({
        method: 'GET',
        url: '/api/test'
      });
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      // Mock res.on to simulate request completion
      res.on = jest.fn((event, callback) => {
        if (event === 'finish') {
          // Simulate request completion
          setTimeout(() => {
            callback();
            expect(console.log).toHaveBeenCalled();
            done();
          }, 10);
        }
      });

      requestLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('errorHandler', () => {
    test('should handle validation errors', () => {
      const err = new Error('Validation failed');
      err.name = 'ValidationError';
      err.errors = { field: 'required' };

      const req = global.testHelpers.createMockRequest();
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Validation failed',
        details: { field: 'required' }
      });
    });

    test('should handle database errors', () => {
      const err = new Error('Database connection failed');
      err.name = 'MongoError';

      const req = global.testHelpers.createMockRequest();
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database Error',
        message: 'A database error occurred'
      });
    });

    test('should handle generic errors', () => {
      const err = new Error('Something went wrong');

      const req = global.testHelpers.createMockRequest();
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong'
      });
    });
  });

  describe('corsMiddleware', () => {
    test('should set CORS headers for allowed origins', () => {
      const req = global.testHelpers.createMockRequest({
        headers: { origin: 'http://localhost:3000' }
      });
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
      expect(next).toHaveBeenCalled();
    });

    test('should handle preflight requests', () => {
      const req = global.testHelpers.createMockRequest({
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' }
      });
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      corsMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('createRateLimit', () => {
    test('should create rate limiter with correct configuration', () => {
      const limiter = createRateLimit();
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    test('should handle rate limiting', () => {
      const req = global.testHelpers.createMockRequest();
      const res = global.testHelpers.createMockResponse();
      const next = jest.fn();

      const limiter = createRateLimit();
      limiter(req, res, next);

      // Rate limiter should call next() for normal requests
      expect(next).toHaveBeenCalled();
    });
  });
});