'use strict';

const dotenv = require('dotenv');
dotenv.config({path: '../.env'});

const mongoose = require('mongoose');

async function connectDB(serviceName) {
    const uri = process.env.MONGODB_URI;

    // Validate required configuration from .env (Atlas URI + database name).
    if (!uri) {
        throw { id: -1, message: serviceName + ': missing MONGODB_URI ' };
    }

    try {
        // Each microservice runs as a separate process, so each one opens its own DB connection.
        await mongoose.connect(uri);

        // Connection diagnostics help during deployment and debugging.
        mongoose.connection.on('error', function (err) {
            console.error(serviceName + ': MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', function () {
            console.log(serviceName + ': MongoDB disconnected');
        });

        console.log(serviceName + ': MongoDB connected');
    } catch (err) {
        // Throw a consistent error shape so API layers can return {id,message}.
        throw { id: -1, message: serviceName + ": failed to connect to MongoDB\n" + err };
    }
}

async function disconnectDB(serviceName) {
    // Useful for unit tests and clean shutdowns.
    try {
        await mongoose.disconnect();
    } catch (err) {
        throw { id: -1, message: serviceName + ': failed to disconnect from MongoDB' };
    }
}

module.exports = {
    connectDB: connectDB,
    disconnectDB: disconnectDB
};
