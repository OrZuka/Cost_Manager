'use strict';

const mongoose = require('mongoose');

const developerSchema = new mongoose.Schema(
    {
        first_name: {
            type: String,
            required: true,
            trim: true
        },
        last_name: {
            type: String,
            required: true,
            trim: true
        }
    },
    { versionKey: false }
);

module.exports = mongoose.model('developers', developerSchema);
