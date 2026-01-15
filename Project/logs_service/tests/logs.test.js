/**
 * Logs Service Tests
 * 
 * This test suite validates the logs service endpoints including:
 * - Retrieving all logs (GET /api/logs)
 * - Creating new log entries (POST /internal/logs)
 * 
 * Tests use MongoDB Memory Server for isolated, in-memory database testing.
 */

// Set environment to test mode
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

/**
 * Test setup - runs once before all tests
 * 
 * Creates an in-memory MongoDB instance and connects to it.
 * Loads the application after database connection is established.
 * This ensures tests run against a clean, isolated database.
 * 
 * Timeout: 30 seconds (MongoDB Memory Server can take time to start)
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  app = require('../app');
}, 30000);

/**
 * Test cleanup - runs once after all tests
 * 
 * Disconnects from MongoDB and stops the in-memory server.
 * Ensures proper cleanup of resources.
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

/**
 * Test isolation - runs after each individual test
 * 
 * Clears all collections in the database to ensure test isolation.
 * Each test starts with a clean database state.
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Logs Service', () => {
  describe('GET /api/logs', () => {
    /**
     * Test: Verify that GET /api/logs returns successfully
     * 
     * Expected behavior:
     * - Returns HTTP 200 status code
     * - Returns array of log entries (may be empty)
     */
    it('should return 200', async () => {
      const res = await request(app).get('/api/logs');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /internal/logs', () => {
    /**
     * Test: Verify that a valid log entry can be created
     * 
     * Expected behavior:
     * - Accepts log entry with all required fields (endpoint, method, message)
     * - Returns HTTP 200 status code
     * 
     * Note: This endpoint requires endpoint, method, and message fields
     * as per the validation logic in logs.routes.js
     */
    it('should accept log entry', async () => {
      const res = await request(app)
        .post('/internal/logs')
        .send({
          level: 'info',
          service: 'test-service',
          endpoint: '/api/test',
          method: 'GET',
          message: 'test message'
        });
      
      expect(res.statusCode).toBe(200);
    });
  });
});