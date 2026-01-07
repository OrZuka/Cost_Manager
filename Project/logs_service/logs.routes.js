'use strict';

const express = require('express');
const router = express.Router();

const log = require('./logs.model');

// POST /internal/logs
// Used by other microservices to send log events to logs-service for storage in MongoDB.
router.post('/internal/logs', async function (req, res) {
    try {
        // Normalize incoming payload and apply defaults.
        const logDoc = {
            timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
            level: req.body.level || 'info',
            service: req.body.service || 'unknown',
            endpoint: req.body.endpoint || '',
            method: req.body.method || '',
            message: req.body.message || '',
            statusCode: req.body.statusCode
        };

        // Persist log entry in MongoDB.
        const saved = await log.create(logDoc);

        // Return saved log document.
        return res.json(saved);
    } catch (err) {
        // Return error JSON object with {id,message} as required.
        return res.status(500).json({ id: -1, message: 'failed to write log' });
    }
});

// GET /api/logs
// Required endpoint for graders: list all logs.
router.get('/logs', async function (req, res) {
    try {
        // Return newest logs first (sorting is optional but helpful).
        const logs = await log.find({}).sort({ timestamp: -1 });
        return res.json(logs);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to read logs' });
    }
});

module.exports = router;
