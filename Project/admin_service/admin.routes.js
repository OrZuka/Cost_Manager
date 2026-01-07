'use strict';

const express = require('express');
const router = express.Router();

// Load the developer model (Mongoose schema) used to fetch the team members list.
const developer = require('./admin.model');

// Shared log client that sends logs to logs-service over HTTP.
const logClient = require('../logclient');

// Constant used to identify the service in log events.
const serviceName = 'admin-service';

// GET /api/about
// Returns a JSON document that describes the team members (first + last names only).
router.get('/about', async function (req, res) {
    // Log that the endpoint was accessed (this is required in addition to per-request logging).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/about');

    try {
        // Query the developers collection and return only first_name and last_name.
        // _id is excluded because the assignment says not to include extra data.
        const devs = await developer.find({}, { first_name: 1, last_name: 1, _id: 0 });

        // Return the list as JSON.
        return res.json(devs);
    } catch (err) {
        // Return error JSON object with {id,message} as required by the assignment.
        return res.status(500).json({ id: -1, message: 'failed to get developers list' });
    }
});

module.exports = router;
