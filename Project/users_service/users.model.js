'use strict';

const mongoose = require('mongoose');

// users schema
const userSchema = new mongoose.Schema(
    {
        id: { type: Number, required: true, unique: true, index: true },
        first_name: { type: String, required: true, trim: true },
        last_name: { type: String, required: true, trim: true },
        birthday: { type: Date, required: true }
    },
    { versionKey: false }
);

// Minimal costs schema (only needed to compute total for /api/users/:id)
const costSchema = new mongoose.Schema(
    {
        description: { type: String, required: true },
        category: { type: String, required: true },
        userid: { type: Number, required: true, index: true },
        sum: { type: mongoose.Schema.Types.Decimal128, required: true },
        createdAt: { type: Date, required: true }
    },
    { versionKey: false }
);

// Guard against model re-definition in dev/test environments.
const user = mongoose.models.users || mongoose.model('users', userSchema);
const cost = mongoose.models.costs || mongoose.model('costs', costSchema);

module.exports = {
    user: user,
    cost: cost
};
