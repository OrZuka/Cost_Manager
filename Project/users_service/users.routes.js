'use strict';

const express = require('express');
const router = express.Router();

/**
 * Load both models (user and cost) from a combined models module
 * - user: Model for user documents in the users collection
 * - cost: Model for cost documents used to compute user's total expenses
 */
const models = require('../models/usersCosts.models');
const user = models.user;
const cost = models.cost;

/**
 * Shared log client that sends logs to logs-service over HTTP
 * Used for centralized logging and monitoring across microservices
 */
const logClient = require('../logclient');

/**
 * Constant used to identify this service in log events
 * Helps distinguish logs from different services in the centralized logging system
 */
const serviceName = 'users-service';

/**
 * Helper function: Verify that a value is a non-empty string
 * @param {*} x - Value to check
 * @returns {boolean} - True if x is a string with at least one non-whitespace character
 */
function isNonEmptyString(x) {
  return typeof x === 'string' && x.trim().length > 0;
}

/**
 * Helper function: Convert an input value to a Number
 * @param {*} x - Value to convert
 * @returns {number|null} - Converted number, or null if conversion fails (NaN/Infinity/non-numeric)
 */
function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Helper function: Convert an input value to a Date object
 * @param {*} x - Value to convert (string, number, or Date)
 * @returns {Date|null} - Valid Date object, or null if input is not a valid date
 */
function toDate(x) {
  const d = new Date(x);
  // d.getTime() returns NaN when the date is invalid
  return isNaN(d.getTime()) ? null : d;
}

/**
 * POST /api/add
 * Creates a new user in the database
 * 
 * Request body:
 * - id: number (required)
 * - first_name: string (required, non-empty)
 * - last_name: string (required, non-empty)
 * - birthday: date string (required, valid date format)
 * 
 * Response:
 * - 200: Created user object
 * - 400: Invalid input data
 * - 500: Database error
 */
router.post('/add', async function (req, res) {
  // Log endpoint access for monitoring and auditing purposes
  await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: POST /api/add (user)');

  try {
    // Extract and validate incoming user fields from request body
    const id = toNumber(req.body.id);
    const firstName = req.body.first_name;
    const lastName = req.body.last_name;
    const birthday = toDate(req.body.birthday);

    // Validate id field - must be a valid number
    if (id === null) {
      return res.status(400).json({ id: -1, message: 'invalid id' });
    }

    // Validate first_name field - must be a non-empty string
    if (!isNonEmptyString(firstName)) {
      return res.status(400).json({ id: -1, message: 'invalid first_name' });
    }

    // Validate last_name field - must be a non-empty string
    if (!isNonEmptyString(lastName)) {
      return res.status(400).json({ id: -1, message: 'invalid last_name' });
    }

    // Validate birthday field - must be a valid date
    if (!birthday) {
      return res.status(400).json({ id: -1, message: 'invalid birthday' });
    }

    // Create and save a new user document in MongoDB
    const created = await user.create({
      id: id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      birthday: birthday
    });

    // Return the created user document as JSON
    return res.json(created);
  } catch (err) {
    // Handle database errors (e.g., duplicate key constraint violations)
    return res.status(500).json({ id: -1, message: 'failed to add user', error: err.message });
  }
});

/**
 * GET /api/users
 * Retrieves a list of all users in the database
 * 
 * Response:
 * - 200: Array of user objects
 * - 500: Database error
 */
router.get('/users', async function (req, res) {
  // Log endpoint access for monitoring and auditing purposes
  await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/users');

  try {
    // Query all users from MongoDB (no filter, returns all documents)
    const users = await user.find({});
    return res.json(users);
  } catch (err) {
    // Handle database query errors
    return res.status(500).json({ id: -1, message: 'failed to list users', error: err.message });
  }
});

/**
 * GET /api/users/:id
 * Retrieves a specific user's details along with their total expenses
 * Aggregates cost data from the costs collection to calculate total spending
 * 
 * URL Parameters:
 * - id: User's numeric ID
 * 
 * Response:
 * - 200: User object with fields: first_name, last_name, id, total
 * - 400: Invalid user ID format
 * - 404: User not found
 * - 500: Database error
 */
router.get('/users/:id', async function (req, res) {
  // Log endpoint access for monitoring and auditing purposes
  await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/users/:id');

  try {
    // Validate that the id parameter is numeric
    const userId = toNumber(req.params.id);
    if (userId === null) {
      return res.status(400).json({ id: -1, message: 'invalid id' });
    }

    // Fetch the user document by id from the users collection
    const userDoc = await user.findOne({ id: userId });
    if (!userDoc) {
      return res.status(404).json({ id: -1, message: 'user not found' });
    }

    /**
     * Compute the user's total costs using MongoDB aggregation pipeline:
     * 1. $match: Filter costs for this specific user
     * 2. $group: Sum all 'sum' fields to calculate total expenses
     */
    const agg = await cost.aggregate([
      { $match: { userid: userId } },
      { $group: { _id: null, total: { $sum: '$sum' } } }
    ]);

    // Default total to 0 if user has no associated costs
    let total = 0;

    // If aggregation returned a result, extract and convert the total
    if (agg && agg.length > 0 && agg[0].total !== undefined && agg[0].total !== null) {
      total = Number(agg[0].total);
    }

    // Return the response in the exact format required by the assignment specification
    return res.json({
      first_name: userDoc.first_name,
      last_name: userDoc.last_name,
      id: userDoc.id,
      total: total
    });
  } catch (err) {
    // Handle any database or aggregation errors
    return res.status(500).json({ id: -1, message: 'failed to get user details', details: err.message });
  }
});

// Export the router to be mounted in the main application
module.exports = router;