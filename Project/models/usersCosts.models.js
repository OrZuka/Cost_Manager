'use strict';

const mongoose = require('mongoose');

// Users schema
const userSchema = new mongoose.Schema(
    {
        id: { type: Number, required: true, unique: true, index: true },
        first_name: { type: String, required: true, trim: true },
        last_name: { type: String, required: true, trim: true },
        birthday: { type: Date, required: true }
    },
    { versionKey: false }
);

// Costs schema
const costSchema = new mongoose.Schema(
    {
        description: { type: String, required: true, trim: true },
        category: { type: String, required: true, enum: ['food', 'health', 'housing', 'sports', 'education'] },
        userid: { type: Number, required: true, index: true },
        sum: { type: mongoose.Schema.Types.Decimal128, required: true },
        createdAt: { type: Date, required: true }
    },
    { versionKey: false }
);

costSchema.index({ userid: 1, createdAt: 1 });

// Safe model creation (prevents OverwriteModelError)
const user = mongoose.models.users || mongoose.model('users', userSchema);
const cost = mongoose.models.costs || mongoose.model('costs', costSchema);

module.exports = {
    user: user,
    cost: cost
};
