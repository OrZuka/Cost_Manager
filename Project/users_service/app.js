'use strict';

//const dotenv = require("dotenv");
//dotenv.config({path: '../.env'})

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const db = require('../models/db');

const serviceName = 'users-service';

const usersRoutes = require('./users.routes');

const app = express();

const logClient = require('../logclient');

//Using HTTP request logger
app.use(logClient.requestLogger('users-service'));

app.use(express.json());

// Basic request trace (you will replace with Pino->Mongo logging middleware).
app.use(function (req, res, next) {
    console.log(serviceName + ': request ' + req.method + ' ' + req.originalUrl);
    next();
});

// Routes: add user, list users, user details.
app.use('/api', usersRoutes);

// Minimal error handler to ensure JSON errors.
app.use(function (err, req, res, next) {
    const errorObj = err && err.message ? err : { id: -1, message: 'internal server error' };
    res.status(500).json({ id: errorObj.id || -1, message: errorObj.message || 'internal server error' });
});
//DB connection
db.connectDB(serviceName).catch(function (err) {
    console.error(err);
    process.exit(1);
});

const port = Number(process.env.USERS_PORT || process.env.PORT || 3000);
//Listens on port 3000
app.listen(port, function () {
    console.log(serviceName + ': listening on port ' + port);
});
