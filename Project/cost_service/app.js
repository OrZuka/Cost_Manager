'use strict';

/**
 * Costs Service Application
 * 
 * This service handles cost-related operations including:
 * - Adding new cost items
 * - Generating monthly cost reports (with Computed Pattern caching)
 * 
 * Port: 3001 (default)
 * Environment variables: COSTS_PORT, PORT
 */

// Load environment variables from .env file in parent directory
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const db = require('../models/db');

// Service identifier for logging purposes
const serviceName = 'costs-service';

const costsRoutes = require('./costs.routes');
const logClient = require('../logclient');

const app = express();

// Parse incoming JSON request bodies
app.use(express.json());

/**
 * Request logging middleware
 * Logs basic information about each incoming request
 */
app.use(function (req, res, next) {
    console.log(serviceName + ': request ' + req.method + ' ' + req.originalUrl);
    next();
});

// Apply HTTP request logger middleware
app.use(logClient.requestLogger(serviceName));

// Mount routes: cost operations (add cost, monthly report)
app.use('/api', costsRoutes);

/**
 * Error handling middleware
 * Ensures all errors are returned as JSON with consistent structure
 */
app.use(function (err, req, res, next) {
    const errorObj = err && err.message ? err : { id: -1, message: 'internal server error' };
    res.status(500).json({ id: errorObj.id || -1, message: errorObj.message || 'internal server error' });
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

const port = Number(process.env.PORT || process.env.COSTS_PORT || 3001);

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