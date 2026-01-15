'use strict';

const mongoose = require('mongoose');
//Logs schema
const logSchema = new mongoose.Schema(
    {
        timestamp: { type: Date, required: true },
        level: { type: String, required: true },
        service: { type: String, required: true },
        endpoint: { type: String, required: true },
        method: { type: String, required: true },
        message: { type: String, required: true },
        statusCode: { type: Number, required: false }
    },
    { versionKey: false }
);

logSchema.index({ timestamp: -1 });

// Guard against model re-definition in dev/test environments.
const logs = mongoose.models.logs || mongoose.model('logs', logSchema);

module.exports = logs;
