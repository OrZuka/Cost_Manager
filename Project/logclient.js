'use strict';

const pino = require('pino');

const logger = pino();

async function sendLog(logEvent) {
    const baseUrl = process.env.LOGS_SERVICE_URL;

    if (!baseUrl) {
        return;
    }

    if (!logEvent || !logEvent.service || !logEvent.endpoint || !logEvent.method || !logEvent.message) {
        logger.warn('logclient: missing required logEvent fields');
        return;
    }

    const payload = {
        timestamp: logEvent.timestamp || new Date().toISOString(),
        level: logEvent.level || 'info',
        service: logEvent.service,
        endpoint: logEvent.endpoint,
        method: logEvent.method,
        message: logEvent.message,
        statusCode: logEvent.statusCode
    };

    try {
        await fetch(baseUrl + '/internal/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        logger.error({ err: err }, 'logclient: failed to send log to logs-service');
    }
}

function sendRequestLog(serviceName, req, res, durationMs) {
    return sendLog({
        service: serviceName,
        endpoint: req.originalUrl,
        method: req.method,
        message: 'http request received (duration ' + durationMs + 'ms)',
        statusCode: res.statusCode
    });
}

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
        const startedAt = Date.now();

        res.on('finish', function () {
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
