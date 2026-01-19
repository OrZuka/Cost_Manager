'use strict';

/**
 * Logs Service Routes
 * 
 * Handles centralized logging using Pino with MongoDB persistence.
 * Implements a custom stream (MongoLogStream) that saves Pino logs directly to MongoDB.
 * 
 * Routes:
 * - POST /internal/logs - Receive log events from other services
 * - GET /logs - Retrieve all logs (for graders/debugging)
 */

const express = require('express');
const router = express.Router();
router.use(requestLoggerInternal("logs-service"));


const pino = require('pino');
const Log = require('./logs.model');

/**
 * MongoLogStream Class
 * 
 * Custom writable stream for Pino that saves logs directly to MongoDB.
 * Pino writes one JSON log line per write() call.
 * This stream parses that JSON line and inserts it into the logs collection.
 */
class MongoLogStream {
    /**
     * Write method called by Pino for each log entry
     * @param {Buffer|string} chunk - Log data from Pino
     * @returns {boolean} Always returns true to indicate successful write
     */
    write(chunk) {
        const line = String(chunk).trim();

        if (!line) {
            return true;
        }

        try {
            // When Pino writes, it's usually JSON. Parse and store it as the MongoDB doc.
            const obj = JSON.parse(line);

            // Save the full Pino object into MongoDB.
            // If schema is strict, fields may be dropped; adjust logs.model accordingly.
            Log.create(obj).catch(function (err) {
                process.stderr.write('Failure: ' + err.message + '\n');
            });
        } catch (err) {
            // If not valid JSON, store it as a simple message.
            Log.create({ msg: line }).catch(function (err2) {
                process.stderr.write('Failure: ' + err2.message + '\n');
            });
        }

        return true;
    }
}

// Create a shared Pino instance that writes directly to MongoDB via MongoLogStream.
// This matches the Jump Start pattern: pino(options, new MongoLogStream()).
const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        base: { service: 'logs-service' }
    },
    new MongoLogStream()
);

/**
 * Helper: Normalize incoming log level to a valid Pino method name
 * @param {string} level - Log level from request
 * @returns {string} Valid Pino level (error/warn/info/debug), defaults to 'info'
 */
function normalizeLevel(level) {
    if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
        return level;
    }
    return 'info';
}

/**
 * POST /internal/logs
 * 
 * Receives log events from other microservices and persists them to MongoDB.
 * Uses Pino for structured logging; MongoLogStream saves to database.
 * 
 * Validates required fields:
 * - endpoint (required)
 * - method (required)
 * - message (required)
 * 
 * @route POST /internal/logs
 * @param {Object} req.body - Log data
 * @param {string} [req.body.level='info'] - Log level (error/warn/info/debug)
 * @param {string} [req.body.service='unknown'] - Service name
 * @param {string} req.body.endpoint - API endpoint
 * @param {string} req.body.method - HTTP method
 * @param {number} [req.body.statusCode] - HTTP status code
 * @param {string} req.body.message - Log message
 * @param {string} [req.body.timestamp] - Optional timestamp (defaults to now)
 * @returns {Object} 200 - Created log entry
 * @returns {Object} 400 - Validation error (missing required fields)
 * @returns {Object} 500 - Server error
 */
router.post('/internal/logs', async function (req, res) {
    try {
        const level = normalizeLevel(req.body.level || 'info');

        // Build the log data that will be emitted through Pino.
        // Pino will serialize this object to JSON; MongoLogStream will parse it and save it as the DB doc.
        const logData = {
            // Use the "time" field that Pino commonly writes; your schema should accept it.
            // If you prefer, you can also include a timestamp field; the PDF uses timestamps config on schema.
            timestamp: req.body.timestamp ? new Date(req.body.timestamp).toISOString() : new Date().toISOString(),

            // Keep the fields expected by your system.
            level: level,
            service: req.body.service || 'unknown',
            endpoint: req.body.endpoint || '',
            method: req.body.method || '',
            statusCode: req.body.statusCode,

            // Pino's default message field is "msg" (it will also exist in the serialized JSON).
            message: req.body.message || ''
        };

        // Minimal validation (avoid saving meaningless logs).
        if (!logData.endpoint || !logData.method || !logData.message) {
            return res.status(400).json({ id: -1, message: 'invalid log payload' });
        }

        // Emit using Pino. MongoLogStream will save it to MongoDB.
        logger[level](logData, logData.message);

        // Return what we emitted (this is your "logDoc" as created by Pino).
        return res.json(logData);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to write log' , error: err.message });
    }
});

/**
 * GET /logs
 *
 * Retrieves all log entries from the database.
 * Primarily for graders and debugging purposes.
 * Logs the endpoint entry access
 *
 * @route GET /logs (also accessible at /api/logs)
 * @returns {Array} 200 - Array of log entries sorted by time (newest first)
 * @returns {Object} 500 - Server error
 */
router.get('/api/logs', async function (req, res) {
    // Endpoint access log
    const endpointAccessLogData = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'logs-service',
        endpoint: req.originalUrl || req.url,
        method: req.method,
        message: 'endpoint accessed: GET /api/logs'
    };
    logger.info(endpointAccessLogData, endpointAccessLogData.message);

    try {
        const logs = await Log.find({}).sort({ time: -1 });
        return res.status(200).json(logs);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to read logs' });
    }
});

// Local request-log writer for logs-service (DO NOT call logclient here)
function sendRequestLogInternal(serviceName, req, res, durationMs) {
    const logData = {
        timestamp: new Date().toISOString(),
        level: "info",
        service: serviceName,
        method: req.method,
        endpoint: req.originalUrl || req.url,
        statusCode: res.statusCode,
        message: "http request received (duration " + durationMs + "ms)",
    };

    // This should go through your Pino logger that writes to Mongo
    logger.info(logData, logData.message);
}

// Express middleware factory: logs every HTTP request when the response finishes.
function requestLoggerInternal(serviceName) {
    return function (req, res, next) {
        // Skip logging for health checks and internal logging (Render / monitoring)
        if (req.path === "/api/health" || req.originalUrl === "/api/health" || req.originalUrl === "/internal/logs") {
            return next();
        }

        const startedAt = Date.now();
        //Invoking log function after request is processed
        res.on("finish", function () {
            const durationMs = Date.now() - startedAt;
            sendRequestLogInternal(serviceName, req, res, durationMs);
        });

        next();
    };
}

// Health check (Render). No logging, no DB.
router.get('/api/health', function (req, res) {
    return res.status(200).json({ status: 'ok', service: "logs-service" });
});

module.exports = router;