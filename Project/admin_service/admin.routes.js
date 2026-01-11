'use strict';

const express = require('express');
const router = express.Router();

// Shared log client that sends logs to logs-service over HTTP.
const logClient = require('../logclient');

// Constant used to identify the service in log events.
const serviceName = 'admin-service';

// Team members embedded in code (no DB usage).
// The assignment requires returning only first_name and last_name (no extra fields).
const developers = [
    { first_name: 'Or', last_name: 'Zuka' },
    { first_name: 'Shilat', last_name: 'Zrihen' }
];

// GET /api/about
// Returns a JSON document that describes the team members (first + last names only).
router.get('/about', async function (req, res) {
    // Log that the endpoint was accessed (this is required in addition to per-request logging).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/about');

    try {
        // Return embedded developers list as JSON.
        return res.json(developers);
    } catch (err) {
        // Return error JSON object with {id,message} as required by the assignment.
        return res.status(500).json({ id: -1, message: 'failed to get developers list' });
    }
});

module.exports = router;
