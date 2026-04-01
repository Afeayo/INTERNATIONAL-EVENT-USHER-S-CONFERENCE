const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const voteRouter = require('./route/voteRoute');
const adminRouter = require('./route/adminRoute');
const nomineeRouter = require('./route/nomineeRoute');
const userRouter = require('./route/userRoute');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB Atlas:', error);
    });

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'AfeAyo28js872', 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    })
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/admin', adminRouter);
app.use('/user', userRouter);
app.use('/vote', voteRouter);
app.use('/nominees', nomineeRouter);

app.get('/', (req, res) => {
    res.render('index');
});

// Start server
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');
    })
    .catch((error) => {
        console.error('MongoDB error:', error);
        process.exit(1); // ensures clean failure instead of weird loop
    });
    console.log("MONGO_URI:", process.env.MONGO_URI);