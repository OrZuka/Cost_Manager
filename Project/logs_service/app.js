'use strict';

/**
 * Logs Service Application
 * 
 * This service handles centralized logging for all microservices.
 * It receives log events from other services via HTTP and stores them in MongoDB.
 * Uses Pino for structured logging with a custom stream that writes to MongoDB.
 * 
 * Endpoints:
 * - GET /api/logs - Retrieve all logs (for graders/debugging)
 * - POST /internal/logs - Receive log events from other services
 * 
 * Port: 3002 (default)
 * Environment variables: LOGS_PORT
 */

// Load environment variables from .env file in parent directory
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const db = require('../models/db');
const logsRoutes = require('./logs.routes');

// Service identifier for logging purposes
const serviceName = 'logs-service';

const app = express();

// Parse JSON bodies (needed for POST /internal/logs)
app.use(express.json());

/**
 * Route mounting
 * - /api/logs - GET endpoint for retrieving logs (grader/debugging)
 * - /internal/logs - POST endpoint for receiving logs from other services
 */
app.use('/', logsRoutes);

/**
 * Error handling middleware
 * Ensures all errors are returned as JSON with consistent structure
 */
app.use(function (err, req, res, next) {
    res.status(500).json({ id: -1, message: 'internal server error' });
});

/**
 * Database connection
 * Connect to MongoDB Atlas only in production mode (not in tests)
 * Tests use MongoDB Memory Server instead
 */
if (process.env.NODE_ENV !== 'test') {
    db.connectDB(serviceName).catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}

const port = Number(process.env.PORT || process.env.LOGS_PORT || 3002);

/**
 * Start server
 * Only listen when this file is run directly (not when required by tests)
 */
if (require.main === module) {
    app.listen(port, function () {
        console.log(serviceName + ': listening on port ' + port);
    });
}

// Export app for testing purposes
module.exports = app;