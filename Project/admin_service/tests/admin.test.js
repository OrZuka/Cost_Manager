/**
 * Admin Service Tests
 * 
 * This test suite validates the admin service endpoints.
 * Admin service does not require database access as it returns static team information.
 */

// Set environment to test mode
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');

describe('Admin Service', () => {
  describe('GET /api/about', () => {
    /**
     * Test: Verify that GET /api/about returns team member information
     * 
     * Expected behavior:
     * - Returns HTTP 200 status code
     * - Returns an array of team members
     * - Array contains at least one team member
     * - Each team member has first_name and last_name properties
     */
    it('should return team information', async () => {
      const res = await request(app).get('/api/about');
      
      // Verify successful response
      expect(res.statusCode).toBe(200);
      
      // Verify response is an array
      expect(Array.isArray(res.body)).toBe(true);
      
      // Verify array contains at least one team member
      expect(res.body.length).toBeGreaterThan(0);
      
      // Verify structure of team member object
      expect(res.body[0]).toHaveProperty('first_name');
      expect(res.body[0]).toHaveProperty('last_name');
    });
  });
});