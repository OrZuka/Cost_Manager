'use strict';

const mongoose = require('mongoose');

/*
 * Computed Design Pattern:
 * - If a report is requested for a past month, compute it once, store it in 'reports', and reuse it.
 * - For current/future months, compute and return without saving.
 * - costs with past dates are rejected, so cached past reports remain consistent.
 */

// reports schema (cached monthly reports)
const reportSchema = new mongoose.Schema(
    {
        userid: { type: Number, required: true, index: true },
        year: { type: Number, required: true },
        month: { type: Number, required: true },
        costs: { type: Array, required: true },
        createdAt: { type: Date, required: true, default: Date.now }
    },
    { versionKey: false }
);

reportSchema.index({ userid: 1, year: 1, month: 1 }, { unique: true });

// Guard against model re-definition in dev/test environments.
const report = mongoose.models.reports || mongoose.model('reports', reportSchema);

module.exports = {
    report: report
};
