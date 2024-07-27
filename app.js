const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session'); // Add this line

const voteRouter = require('./route/voteRoute');
const adminRouter = require('./route/adminRoute');
const nomineeRouter = require('./route/nomineeRoute');
const userRouter = require('./route/userRoute');

const app = express();


// Connect to MongoDB

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connected to MongoDB Atlas');
})
.catch((error) => {
    console.error('Error connecting to MongoDB Atlas:', error);
});


// Connect to MongoDB
/*mongoose.connect('mongodb://localhost:27017/Events', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});*/

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'secret', // Replace with your own secret
    resave: false,
    saveUninitialized: true
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
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
