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
// Connect to MongoDB ONCE
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');

        const PORT = process.env.PORT || 8000;
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on ${PORT}`);
        });

    })
    .catch((error) => {
        console.error('MongoDB connection failed:', error);
        process.exit(1);
    });