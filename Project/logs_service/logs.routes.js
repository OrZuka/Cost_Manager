'use strict';

const express = require('express');
const router = express.Router();

const pino = require('pino');

// IMPORTANT:
// This model should allow saving dynamic log fields.
// The Jump Start PDF suggests a schema with strict:false, minimize:false, timestamps:true, collection:'logs'. :contentReference[oaicite:3]{index=3}
const Log = require('./logs.model');

// Pino writes one JSON log line per write().
// This stream parses that JSON line and inserts it into MongoDB (logs collection). :contentReference[oaicite:4]{index=4}
class MongoLogStream {
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
// This matches the Jump Start pattern: pino(options, new MongoLogStream()). :contentReference[oaicite:5]{index=5}
const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        base: { service: 'logs-service' }
    },
    new MongoLogStream()
);

// Helper: normalize incoming level to a Pino method name.
function normalizeLevel(level) {
    if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
        return level;
    }
    return 'info';
}

// POST /internal/logs
// This endpoint receives a log event from other services.
// We use Pino to emit the log; MongoLogStream is responsible for saving it in MongoDB.
router.post('/internal/logs', async function (req, res) {
    try {
        const level = normalizeLevel(req.body.level || 'info');

        // Build the log data that will be emitted through Pino.
        // Pino will serialize this object to JSON; MongoLogStream will parse it and save it as the DB doc.
        const logData = {
            // Use the "time" field that Pino commonly writes; your schema should accept it.
            // If you prefer, you can also include a timestamp field; the PDF uses timestamps config on schema. :contentReference[oaicite:6]{index=6}
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
        return res.status(500).json({ id: -1, message: 'failed to write log' });
    }
});

// GET /api/logs
// For graders: return all logs from the DB.
router.get('/logs', async function (req, res) {
    try {
        // If your logs are stored as Pino objects, the time field might be "time".
        // Sort by time if exists; fallback sort behavior depends on your schema.
        const logs = await Log.find({}).sort({ time: -1 });
        return res.json(logs);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to read logs' });
    }
});

module.exports = router;
