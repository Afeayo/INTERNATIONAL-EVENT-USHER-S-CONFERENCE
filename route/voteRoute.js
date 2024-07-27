const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Nominee = require('../models/nominee');
const Vote = require('../models/vote');

const voteRouter = express.Router();

let tempVoters = {};

// Function to create a transporter
function createTransporter() {
    return nodemailer.createTransport({
        host: 'mail.nijawiseup.com.ng', // SMTP server address
        port: 465, // Port 465 for SSL
        secure: true, // Set to true for SSL connection
        auth: {
            user: process.env.EMAIL_USER, // Your email user from .env
            pass: process.env.EMAIL_PASS // Your email password from .env
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

// Function to generate a unique token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Function to send verification email
async function sendVerificationEmail(email, token) {
    let transporter = createTransporter();

    let verificationLink = `http://localhost:8000/vote/verify-email?token=${token}&email=${email}`;

    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Email Verification',
        text: `Please click the following link to verify your email: ${verificationLink}`
    };

    await transporter.sendMail(mailOptions);
}

// Route to display all nominees with pagination
voteRouter.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const nominees = await Nominee.find().skip(skip).limit(limit);
        const count = await Nominee.countDocuments();

        res.render('nominees', {
            nominees,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            limit
        });
    } catch (err) {
        console.error('Error fetching nominees:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

// Route to handle form submission and initiate email verification
voteRouter.post('/submit', async (req, res) => {
    try {
        const { nomineeId, voterName, voterEmail } = req.body;

        if (!nomineeId || !voterName || !voterEmail) {
            return res.status(400).send('<p>Voter name, voter email, and nominee ID are required.</p>');
        }

        const nominee = await Nominee.findById(nomineeId);
        if (!nominee) {
            console.log('Nominee not found:', nomineeId);
            return res.status(404).send('<p>Nominee not found.</p>');
        }

        const existingVote = await Vote.findOne({ voterEmail, nomineeId });
        if (existingVote) {
            return res.status(400).send('<p>You can only vote once.</p>');
        }

        const token = generateToken();
        tempVoters[voterEmail] = { voterName, voterEmail, nomineeId, token, emailVerified: false };

        await sendVerificationEmail(voterEmail, token);

        res.status(200).send('<p>Verification email sent. Please check your email to verify.</p>');
    } catch (err) {
        console.error('Error initiating vote:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

// Route to verify email
voteRouter.get('/verify-email', async (req, res) => {
    const { token, email } = req.query;

    try {
        const voter = tempVoters[email];

        if (!voter || voter.token !== token) {
            return res.status(400).send('<p>Invalid or expired token.</p>');
        }

        voter.emailVerified = true;

        res.redirect(`/vote/confirm?email=${email}`);
    } catch (err) {
        console.error('Error verifying email:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

// Route to confirm vote after email verification
voteRouter.get('/confirm', async (req, res) => {
    const { email } = req.query;

    try {
        const voter = tempVoters[email];

        if (!voter || !voter.emailVerified) {
            return res.status(400).send('<p>Email not verified or voter does not exist.</p>');
        }

        const vote = new Vote({
            voterName: voter.voterName,
            voterEmail: voter.voterEmail,
            nomineeId: voter.nomineeId
        });
        await vote.save();

        const nominee = await Nominee.findById(voter.nomineeId);
        nominee.votes += 1;
        await nominee.save();

        // Remove the temporary voter details
        delete tempVoters[email];

        res.render('thank_you', { nominee });
    } catch (err) {
        console.error('Error confirming vote:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

// Route to display a single nominee for voting
voteRouter.get('/:nomineeName', async (req, res) => {
    try {
        const rawNomineeName = req.params.nomineeName;
        const nomineeName = decodeURIComponent(rawNomineeName.replace(/-/g, ' '));

        const nominee = await Nominee.findOne({ name: nomineeName });
        if (!nominee) {
            console.log('Nominee not found:', nomineeName);
            return res.status(404).send('<p>Nominee not found.</p>');
        }
        res.render('vote', { nominee });
    } catch (err) {
        console.error('Error fetching nominee:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

module.exports = voteRouter;
