'use strict';

const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');

// Load both models (cost and report) from a single combined models file.
const models = require('./costs.model');
const cost = models.cost;
const report = models.report;

// Shared log client that sends logs to logs-service over HTTP.
const logClient = require('../logclient');

const serviceName = 'costs-service';

// Helper: verify that a value is a string and not empty after trimming spaces.
function isNonEmptyString(x) {
    return typeof x === 'string' && x.trim().length > 0;
}

// Helper: convert an input to a Number.
// Returns null if conversion fails (NaN/Infinity/non-numeric strings).
function toNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

// Helper: ensure category matches one of the required categories from the assignment.
function isValidCategory(cat) {
    return cat === 'food' || cat === 'health' || cat === 'housing' || cat === 'sports' || cat === 'education';
}

// Helper: parse a date if provided, otherwise use the current time.
// Returns null when a date value is provided but invalid, so the caller can fail validation.
function toDateOrNow(x) {
    if (x === undefined || x === null || x === '') {
        // Client did not send a date, so the server uses the request time.
        return new Date();
    }
    const d = new Date(x);
    // d.getTime() returns NaN if the date is invalid.
    return isNaN(d.getTime()) ? null : d;
}

// Helper: build the starting Date of a given month (inclusive).
// Example: monthStart(2026, 1) => 2026-01-01 00:00:00.000
function monthStart(year, month) {
    return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

// Helper: build the start Date of the next month (exclusive end boundary).
// Using an exclusive end boundary avoids issues with different month lengths.
function monthEndExclusive(year, month) {
    return new Date(year, month, 1, 0, 0, 0, 0);
}

// Helper: determine if (year, month) is a month that has fully passed.
// We treat it as "past" when the month’s end is strictly before the current time.
function isPastMonth(year, month) {
    const now = new Date();
    // We compute start/end via helpers to keep the logic consistent.
    return monthEndExclusive(year, month).getTime() < now.getTime();
}

// Helper: create the "costs" array shape required by the assignment response.
// Each category appears even if it has no items.
function buildEmptycosts() {
    return [
        { food: [] },
        { education: [] },
        { health: [] },
        { housing: [] },
        { sports: [] }
    ];
}

// Helper: push a cost item into the correct category bucket inside "grouped".
// grouped is an array like [{food:[]}, {education:[]}, ...], so we search for the right object.
function addToGroupedcosts(grouped, category, item) {
    for (let i = 0; i < grouped.length; i++) {
        const obj = grouped[i];
        if (obj[category] !== undefined) {
            obj[category].push(item);
            return;
        }
    }
}

// POST /api/add
// Adds a new cost document to the costs collection.
router.post('/add', async function (req, res) {
    // Log that the endpoint was accessed (separate from the per-request middleware log).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: POST /api/add (cost)');

    try {
        const description = req.body.description;
        const category = req.body.category;

        // userid must be a number (assignment requires userid type Number).
        const userid = toNumber(req.body.userid);

        // sum can arrive as number or string; convert to Number for validation first.
        const sumNumber = toNumber(req.body.sum);

        // If createdAt not provided, use now; if provided and invalid, returns null.
        const createdAt = toDateOrNow(req.body.createdAt);

        // Validation: required fields and correct types.
        if (!isNonEmptyString(description)) {
            return res.status(400).json({ id: -1, message: 'invalid description' });
        }
        if (!isNonEmptyString(category) || !isValidCategory(category)) {
            return res.status(400).json({ id: -1, message: 'invalid category' });
        }
        if (userid === null) {
            return res.status(400).json({ id: -1, message: 'invalid userid' });
        }
        if (sumNumber === null) {
            return res.status(400).json({ id: -1, message: 'invalid sum' });
        }
        if (!createdAt) {
            return res.status(400).json({ id: -1, message: 'invalid createdAt' });
        }

        // Assignment rule: do not allow adding costs with dates in the past.
        // Note: if createdAt defaults to now, this check passes.
        if (createdAt.getTime() < new Date().getTime()) {
            return res.status(400).json({ id: -1, message: 'cannot add costs with past dates' });
        }

        // Create the document in MongoDB.
        // Decimal128 is used to represent "Double" reliably in Mongoose.
        const created = await cost.create({
            description: description.trim(),
            category: category,
            userid: userid,
            sum: mongoose.Types.Decimal128.fromString(String(sumNumber)),
            createdAt: createdAt
        });

        // Return the created document as JSON.
        return res.json(created);
    } catch (err) {
        // Return error JSON object with {id,message} as required.
        return res.status(500).json({ id: -1, message: 'failed to add cost' });
    }
});

// GET /api/report?id=&year=&month=
// Returns the monthly report grouped by categories, and caches reports for past months.
router.get('/report', async function (req, res) {
    // Log that the endpoint was accessed (separate from the per-request middleware log).
    await logClient.sendEndpointAccessLog(serviceName, req, 'endpoint accessed: GET /api/report');

    try {
        // The assignment query parameters are: id, year, month.
        const userid = toNumber(req.query.id);
        const year = toNumber(req.query.year);
        const month = toNumber(req.query.month);

        // Validation of query parameters.
        if (userid === null) {
            return res.status(400).json({ id: -1, message: 'invalid id' });
        }
        if (year === null || year < 1970 || year > 3000) {
            return res.status(400).json({ id: -1, message: 'invalid year' });
        }
        if (month === null || month < 1 || month > 12) {
            return res.status(400).json({ id: -1, message: 'invalid month' });
        }

        // Computed pattern: for past months, reuse cached report if it exists.
        if (isPastMonth(year, month)) {
            const cached = await report.findOne({ userid: userid, year: year, month: month });
            if (cached) {
                return res.json({
                    userid: cached.userid,
                    year: cached.year,
                    month: cached.month,
                    costs: cached.costs
                });
            }
        }

        // Compute report from costs collection by filtering on createdAt month range.
        const start = monthStart(year, month);
        const end = monthEndExclusive(year, month);

        const costs = await cost.find({
            userid: userid,
            createdAt: { $gte: start, $lt: end }
        });

        // Start with empty category groups to ensure all categories exist in response.
        const grouped = buildEmptycosts();

        // Convert each cost document into the required report item format.
        for (let i = 0; i < costs.length; i++) {
            const c = costs[i];

            // Day is the day-of-month number (1..31) extracted from the cost timestamp.
            const day = c.createdAt.getDate();

            addToGroupedcosts(grouped, c.category, {
                // Convert Decimal128 sum into Number for JSON output.
                sum: Number(c.sum),
                description: c.description,
                day: day
            });
        }

        // Final JSON response matches the assignment format.
        const result = {
            userid: userid,
            year: year,
            month: month,
            costs: grouped
        };

        // Save only if the requested month is in the past (computed cache).
        if (isPastMonth(year, month)) {
            await report.create({
                userid: userid,
                year: year,
                month: month,
                costs: grouped,
                createdAt: new Date()
            }).catch(function () {
                // If caching fails, still return the computed result (do not fail the endpoint).
            });
        }

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ id: -1, message: 'failed to generate report' });
    }
});

module.exports = router;
