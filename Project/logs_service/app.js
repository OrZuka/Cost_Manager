'use strict';

//const dotenv = require('dotenv');
//dotenv.config({path: '../.env'});
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const db = require('../models/db');
const logsRoutes = require('./logs.routes');

const serviceName = 'logs-service';

const app = express();

// Parse JSON bodies (needed for POST /internal/logs).
app.use(express.json());

// Route mounting:
// - GET  /api/logs           (grader endpoint)
// - POST /internal/logs      (called by other services)
app.use('/api', logsRoutes);
app.use('/', logsRoutes);

// Ensure consistent JSON errors.
app.use(function (err, req, res, next) {
    res.status(500).json({ id: -1, message: 'internal server error' });
});

// Connect to MongoDB Atlas for this process.
db.connectDB(serviceName).catch(function (err) {
    console.error(err);
    process.exit(1);
});
//Fetching port from .env file
const port = Number(process.env.LOGS_PORT || 3002);
//App listens on port 3002
app.listen(port, function () {
    console.log(serviceName + ': listening on port ' + port);
});
