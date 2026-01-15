// Set Node environment to test mode to prevent production side effects
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

/**
 * Setup function that runs once before all tests
 * Creates an in-memory MongoDB instance and connects to it
 * Timeout extended to 30 seconds to allow for MongoDB server initialization
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  app = require('../app');
}, 30000);

/**
 * Cleanup function that runs once after all tests complete
 * Disconnects from MongoDB and stops the in-memory server
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

/**
 * Cleanup function that runs after each individual test
 * Clears all data from all collections to ensure test isolation
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Users Service', () => {
  describe('GET /api/users', () => {
    /**
     * Test: Verify that fetching all users returns an empty array initially
     * Expected: Status 200 and an empty array when no users exist
     */
    it('should return 200 with empty array initially', async () => {
      const res = await request(app).get('/api/users');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/add', () => {
    /**
     * Test: Verify that a valid user can be created successfully
     * Expected: Status 200 and response body contains the created user data
     */
    it('should create a user and return 200', async () => {
      const newUser = {
        id: 123,
        first_name: 'Test',
        last_name: 'User',
        birthday: '2000-01-01'
      };

      const res = await request(app)
        .post('/api/add')
        .send(newUser);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 123);
      expect(res.body).toHaveProperty('first_name', 'Test');
    });

    /**
     * Test: Verify that invalid user ID is rejected
     * Expected: Status 400 when id is not a valid number
     */
    it('should reject invalid id', async () => {
      const res = await request(app)
        .post('/api/add')
        .send({
          id: 'not-a-number',
          first_name: 'Test',
          last_name: 'User',
          birthday: '2000-01-01'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/users/:id', () => {
    /**
     * Test: Verify that fetching a specific user returns correct data with total costs
     * Expected: Status 200, user data with id 456, and total costs field initialized to 0
     */
    it('should return user with total costs', async () => {
      // First, create a user
      await request(app)
        .post('/api/add')
        .send({
          id: 456,
          first_name: 'John',
          last_name: 'Doe',
          birthday: '1990-05-15'
        });

      // Then, fetch that user by ID
      const res = await request(app).get('/api/users/456');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 456);
      expect(res.body).toHaveProperty('total', 0);
    });

    /**
     * Test: Verify that fetching a non-existent user returns 404
     * Expected: Status 404 when user ID does not exist in database
     */
    it('should return 404 for non-existent user', async () => {
      const res = await request(app).get('/api/users/99999');
      expect(res.statusCode).toBe(404);
    });
  });
});