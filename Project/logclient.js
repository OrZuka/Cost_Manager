'use strict';

const pino = require('pino');

const logger = pino();

// Helper: normalize log level so logs-service can use it reliably.
function normalizeLevel(level) {
    if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
        return level;
    }
    return 'info';
}

// Send a log event to logs-service.
// logs-service will emit using Pino and store the Pino JSON record in MongoDB.
async function sendLog(logEvent) {
    const baseUrl = process.env.LOGS_SERVICE_URL;

    if (!baseUrl) {
        return;
    }

    // Validation: ensure minimal required fields exist.
    if (!logEvent || !logEvent.service || !logEvent.endpoint || !logEvent.method || !logEvent.message) {
        logger.warn('logclient: missing required logEvent fields');
        return;
    }

    // Payload fields expected by logs-service:
    // - logs-service maps: timestamp -> time, message -> msg.
    const payload = {
        timestamp: logEvent.timestamp || new Date().toISOString(),
        level: normalizeLevel(logEvent.level || 'info'),
        service: logEvent.service,
        endpoint: logEvent.endpoint,
        method: logEvent.method,
        statusCode: logEvent.statusCode,
        message: logEvent.message
    };

    try {
        await fetch(baseUrl + '/internal/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        // Do not throw: logging must not break the main service.
        logger.error({ err: err }, 'logclient: failed to send log to logs-service');
    }
}

// Log that a full HTTP request was received (middleware-level logging).
function sendRequestLog(serviceName, req, res, durationMs) {
    return sendLog({
        service: serviceName,
        endpoint: req.originalUrl,
        method: req.method,
        message: 'http request received (duration ' + durationMs + 'ms)',
        statusCode: res.statusCode
    });
}

// Log that a specific endpoint handler was accessed (controller/route-level logging).
function sendEndpointAccessLog(serviceName, req, message) {
    return sendLog({
        service: serviceName,
        endpoint: req.originalUrl,
        method: req.method,
        message: message
    });
}

// Express middleware factory: logs every HTTP request when the response finishes.
function requestLogger(serviceName) {
    return function (req, res, next) {
        // Skip logging for health checks (Render / monitoring)
        if (req.path === "/api/health" || req.originalUrl === "/api/health") {
            return next();
        }

        const startedAt = Date.now();

        res.on("finish", function () {
            const durationMs = Date.now() - startedAt;
            sendRequestLog(serviceName, req, res, durationMs);
        });

        next();
    };
}


module.exports = {
    sendLog: sendLog,
    sendRequestLog: sendRequestLog,
    sendEndpointAccessLog: sendEndpointAccessLog,
    requestLogger: requestLogger
};
