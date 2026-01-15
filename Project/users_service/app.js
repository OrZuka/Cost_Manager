'use strict';

// Load environment variables from .env file located in parent directory
// Using path.join for cross-platform compatibility
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const db = require('../models/db');
const serviceName = 'users-service';
const usersRoutes = require('./users.routes');
const app = express();
const logClient = require('../logclient');

/**
 * Middleware: HTTP request logger using Pino
 * Logs all incoming requests to MongoDB for monitoring and debugging
 */
app.use(logClient.requestLogger('users-service'));

/**
 * Middleware: Parse incoming JSON request bodies
 * Enables req.body to contain parsed JSON data
 */
app.use(express.json());

/**
 * Middleware: Basic request tracer
 * Logs HTTP method and URL for each incoming request to console
 * Note: This will be enhanced with Pino->MongoDB logging
 */
app.use(function (req, res, next) {
  console.log(serviceName + ': request ' + req.method + ' ' + req.originalUrl);
  next();
});

/**
 * Routes: Mount user-related API endpoints
 * Handles operations like adding users, listing users, and fetching user details
 */
app.use('/api', usersRoutes);

/**
 * Error handling middleware
 * Catches all errors and returns a standardized JSON error response
 * Ensures consistent error format across the API
 */
app.use(function (err, req, res, next) {
  const errorObj = err && err.message ? err : { id: -1, message: 'internal server error' };
  res.status(500).json({ id: errorObj.id || -1, message: errorObj.message || 'internal server error' });
});

/**
 * Database connection initialization
 * Connects to MongoDB Atlas only in non-test environments
 * In test mode, tests use an in-memory MongoDB instance instead
 */
if (process.env.NODE_ENV !== 'test') {
  db.connectDB(serviceName).catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Port configuration
 * Priority: USERS_PORT > PORT > default 3000
 * Allows flexible port assignment via environment variables
 */
const port = Number(process.env.USERS_PORT || process.env.PORT || 3000);

/**
 * Server initialization
 * Starts the Express server only when this file is run directly (not imported as a module)
 * This allows tests to import the app without starting the server
 */
if (require.main === module) {
  app.listen(port, function () {
    console.log(serviceName + ': listening on port ' + port);
  });
}

// Export the app for use in tests and other modules
module.exports = app;