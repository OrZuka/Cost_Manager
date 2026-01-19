'use strict';

/**
 * Costs Service Routes
 * 
 * Handles cost-related operations:
 * - POST /api/add - Add a new cost item
 * - GET /api/report - Generate monthly cost report (with Computed Pattern caching)
 */

const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');

// Load both models (cost and report) from a different models file.
const reportModel = require('./costs.model');
const costUsersModel = require('../models/usersCosts.models');
const cost = costUsersModel.cost;
const report = reportModel.report;
const users = costUsersModel.user;

// Shared log client that sends logs to logs-service over HTTP.
const logClient = require('../logclient');

const serviceName = 'costs-service';

/**
 * Helper: Verify that a value is a string and not empty after trimming spaces
 * @param {*} x - Value to check
 * @returns {boolean} True if x is a non-empty string
 */
function isNonEmptyString(x) {
    return typeof x === 'string' && x.trim().length > 0;
}

/**
 * Helper: Convert an input to a Number
 * @param {*} x - Value to convert
 * @returns {number|null} Number if valid, null if conversion fails (NaN/Infinity/non-numeric)
 */
function toNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

/**
 * Helper: Ensure category matches one of the required categories from the assignment
 * @param {string} cat - Category to validate
 * @returns {boolean} True if category is valid (food, health, housing, sports, education)
 */
function isValidCategory(cat) {
    return cat === 'food' || cat === 'health' || cat === 'housing' || cat === 'sports' || cat === 'education';
}

/**
 * Helper: Parse a date if provided, otherwise use the current time
 * @param {*} x - Date value to parse
 * @returns {Date|null} Date object if valid, null if invalid, current date if not provided
 */
function toDateOrNow(x) {
    if (x === undefined || x === null || x === '') {
        // Client did not send a date, so the server uses the request time.
        return new Date();
    }
    const d = new Date(x);
    // d.getTime() returns NaN if the date is invalid.
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Helper: Build the starting Date of a given month (inclusive)
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @returns {Date} Start of month (e.g., 2026-01-01 00:00:00.000)
 */
function monthStart(year, month) {
    return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/**
 * Helper: Build the start Date of the next month (exclusive end boundary)
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Date} Start of next month (exclusive boundary)
 */
function monthEndExclusive(year, month) {
    return new Date(year, month, 1, 0, 0, 0, 0);
}

/**
 * Helper: Determine if (year, month) is a month that has fully passed
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {boolean} True if month has ended
 */
function isPastMonth(year, month) {
    const now = new Date();
    // We compute start/end via helpers to keep the logic consistent.
    return monthEndExclusive(year, month).getTime() < now.getTime();
}

/**
 * Helper: Create the "costs" array shape required by the assignment response
 * @returns {Array} Array with all 5 categories initialized to empty arrays
 */
function buildEmptycosts() {
    return [
        { food: [] },
        { education: [] },
        { health: [] },
        { housing: [] },
        { sports: [] }
    ];
}

/**
 * Helper: Push a cost item into the correct category bucket inside "grouped"
 * @param {Array} grouped - Array of category objects
 * @param {string} category - Category name
 * @param {Object} item - Cost item to add
 */
function addToGroupedcosts(grouped, category, item) {
    for (let i = 0; i < grouped.length; i++) {
        const obj = grouped[i];
        if (obj[category] !== undefined) {
            obj[category].push(item);
            return;
        }
    }
}

/**
 * POST /api/add
 * 
 * Adds a new cost document to the costs collection.
 * 
 * Validates:
 * - User existence (assignment Q&A #11 requirement)
 * - All required fields (userid, sum, category, description)
 * - No backdating (createdAt must not be in the past)
 * - Category must be one of 5 valid categories
 * 
 * @route POST /api/add
 * @param {Object} req.body - Cost data
 * @param {number} req.body.userid - User ID
 * @param {number} req.body.sum - Cost amount
 * @param {string} req.body.category - Cost category (food/health/housing/sports/education)
 * @param {string} req.body.description - Cost description
 * @param {string} [req.body.createdAt] - Optional timestamp (defaults to now)
 * @returns {Object} 200 - Created cost document
 * @returns {Object} 400 - Validation error
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Server error
 */
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

        const currentTime=new Date();
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

        // do not allow adding costs with dates in the past.
        // Note: if createdAt defaults to now, this check passes.
        if (createdAt.getTime() < currentTime.getTime()) {
            return res.status(400).json({ id: -1, message: 'cannot add costs with past dates' });
        }

        const userExists = await users.findOne({ id: userid });
        if (!userExists) {
            return res.status(404).json({ id: -1, message: 'user not found' });
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
        return res.status(500).json({ id: -1, message: 'failed to add cost' , error: err.message });
    }
});

/**
 * GET /api/report
 * 
 * Returns the monthly cost report grouped by categories.
 * Implements Computed Pattern: caches reports for past months for better performance.
 * 
 * Query Parameters:
 * @param {number} id - User ID
 * @param {number} year - Year (1970-3000)
 * @param {number} month - Month (1-12)
 * 
 * @route GET /api/report?id=&year=&month=
 * @returns {Object} 200 - Cost report with structure: {userid, year, month, costs}
 * @returns {Object} 400 - Validation error (invalid parameters)
 * @returns {Object} 500 - Server error
 */
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

        /*
         * ====================================================================
         * COMPUTED DESIGN PATTERN IMPLEMENTATION
         * ====================================================================
         * 
         * This endpoint implements the Computed Pattern for efficient report generation.
         * 
         * CONCEPT:
         * Monthly cost reports are expensive to compute (requires aggregation and grouping
         * of potentially many cost documents). However, once a month is over, its data
         * becomes immutable - no new costs can be added to past months (enforced by the
         * 'no backdating' rule in POST /api/add).
         * 
         * IMPLEMENTATION:
         * 1. For PAST months (months that have already ended):
         *    - First request: Compute the report from scratch by querying and aggregating
         *      all costs for that month from the costs collection.
         *    - After computation: Cache the complete report in the reports collection.
         *    - Subsequent requests: Return the cached report directly from the reports
         *      collection without recomputing - this is significantly faster.
         * 
         * 2. For CURRENT/FUTURE months:
         *    - Always compute fresh from the costs collection on every request.
         *    - Never cache, because new costs may still be added to these months.
         * 
         * BENEFITS:
         * - Improved performance: Cached reports avoid expensive repeated computations.
         * - Consistency: Past data never changes, so cached reports remain accurate.
         * - Scalability: As the database grows, old reports remain fast to retrieve.
         * 
         * TRADEOFF:
         * - Extra storage: Each computed report is stored in the reports collection.
         * - This is acceptable because storage is cheap compared to computation time.
         * ====================================================================
         */
        
        // Step 1: Check if this is a past month and if a cached report exists
        if (isPastMonth(year, month)) {
            const cached = await report.findOne({ userid: userid, year: year, month: month });
            if (cached) {
                // Return cached report (Computed Pattern - reuse precomputed result)
                return res.json({
                    userid: cached.userid,
                    year: cached.year,
                    month: cached.month,
                    costs: cached.costs
                });
            }
        }

        // Step 2: Compute report from costs collection by filtering on createdAt month range
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

        // Step 3: Save computed report to cache if this is a past month
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
        return res.status(500).json({ id: -1, message: 'failed to generate report' ,error: err.message });
    }
});

// Health check (Render). No logging, no DB.
router.get('/health', function (req, res) {
    return res.status(200).json({ status: 'ok', service: serviceName });
});

module.exports = router;