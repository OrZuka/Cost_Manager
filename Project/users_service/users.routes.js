'use strict';

const express = require('express');
const router = express.Router();

// Load both models (user and cost) from a combined models module.
// user is used for user documents; cost is used to compute the user's total expenses.
const models = require('./users.model');
const user = models.user;
const cost = models.cost;

// Shared log client that sends logs to logs-service over HTTP.
const logClient = require('../logclient');

// Constant used to identify the service in log events.
const serviceName = 'users-service';

// Helper: verify that a value is a string and is not empty after trimming spaces.
function isNonEmptyString(x) {
    return typeof x === 'string' && x.trim().length > 0;
}

// Helper: convert an input value to a Number.
// Returns null if conversion fails (NaN/Infinity/non-numeric string).
function toNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

// Helper: convert an input value to a Date.
// Returns null if the input is not a valid date.
function toDate(x) {
    const d = new Date(x);

    // d.getTime() returns NaN when the date is invalid.
    return isNaN(d.getTime()) ? null : d;
}

// POST /api/add
// Adds a new user to the users collection.
router.post('/add', async function (req, res) {
    // Log that the endpoint was accessed (required in addition to per-request logging).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: POST /api/add (user)');

    try {
        // Read and validate incoming user fields from request body.
        const id = toNumber(req.body.id);
        const firstName = req.body.first_name;
        const lastName = req.body.last_name;
        const birthday = toDate(req.body.birthday);

        // Validation is required by the assignment Q&A.
        if (id === null) {
            return res.status(400).json({ id: -1, message: 'invalid id' });
        }
        if (!isNonEmptyString(firstName)) {
            return res.status(400).json({ id: -1, message: 'invalid first_name' });
        }
        if (!isNonEmptyString(lastName)) {
            return res.status(400).json({ id: -1, message: 'invalid last_name' });
        }
        if (!birthday) {
            return res.status(400).json({ id: -1, message: 'invalid birthday' });
        }

        // Create and save a new user document in MongoDB.
        const created = await user.create({
            id: id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            birthday: birthday
        });

        // Return the created user document as JSON.
        return res.json(created);
    } catch (err) {
        // Duplicate key or other DB errors end up here.
        return res.status(500).json({ id: -1, message: 'failed to add user'  , error: err.message });
    }
});

// GET /api/users
// Returns a list of all users.
router.get('/users', async function (req, res) {
    // Log that the endpoint was accessed (required in addition to per-request logging).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/users');

    try {
        // Query all users from MongoDB.
        const users = await user.find({});
        return res.json(users);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to list users', error: err.message });
    }
});

// GET /api/users/:id
// Returns a user's details + the total cost sum for that user.
router.get('/users/:id', async function (req, res) {
    // Log that the endpoint was accessed (required in addition to per-request logging).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/users/:id');

    try {
        // Validate that the id parameter is numeric.
        const userId = toNumber(req.params.id);
        if (userId === null) {
            return res.status(400).json({ id: -1, message: 'invalid id' });
        }

        // Fetch the user document by id from the users collection.
        const userDoc = await user.findOne({ id: userId });
        if (!userDoc) {
            return res.status(404).json({ id: -1, message: 'user not found' });
        }

        // Compute the user's total costs from the costs collection using aggregation.
        const agg = await cost.aggregate([
            { $match: { userid: userId } },
            { $group: { _id: null, total: { $sum: '$sum' } } }
        ]);

        // Default total if user has no costs.
        let total = 0;

        // If aggregation returned a value, convert it to a JS Number for JSON response.
        if (agg && agg.length > 0 && agg[0].total !== undefined && agg[0].total !== null) {
            total = Number(agg[0].total);
        }

        // Return the exact response shape required by the assignment.
        return res.json({
            first_name: userDoc.first_name,
            last_name: userDoc.last_name,
            id: userDoc.id,
            total: total
        });
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to get user details', details: err.message });
    }
});

module.exports = router;
