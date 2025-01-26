require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const User = require('../models/user');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const userRouter = express.Router();
let tempUsers = {};

// Create a custom HTTPS agent
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Function to generate a unique token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Nodemailer transporter
let transporter = nodemailer.createTransport({
    host: 'smtp.us.appsuite.cloud',
    port: 465,
    secure: true, // Use SSL for port 465
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to send verification email
async function sendVerificationEmail(name, email, token) {
    let verificationLink = `https://eventushersconference.com.ng/user/register/verify-email?token=${token}&email=${email}`;

    let mailOptions = {
        from: 'info@eventushersconference.com.ng',
        to: email,
        subject: 'Verify Your Email Address',
        html: `
            <p>Dear ${name},</p>
            <p>Thank you for registering with <strong>Event Ushers Conference</strong>. To complete your registration, please verify your email by clicking the link below:</p>
            <a href="${verificationLink}" style="background-color:#1a73e8;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
                Verify Email Address
            </a>
            <p>If you did not create an account, please ignore this email.</p>
            <p>Best regards,<br><strong>ICEU Team</strong></p>
        `
    };

    await transporter.sendMail(mailOptions);
}

// Function to send registration details email (for successful registrations)
const sendRegistrationDetails = async (email, user) => {
    const gatePass = `
        Name: ${user.name}
        Email: ${user.email}
        Tel: ${user.tel}
        Unique ID: ${user._id}
    `;
    let JoinWhatsappLink = `https://chat.whatsapp.com/B8Rh0qa1LwRAVFxvFjZGtz`;
    
    let mailOptions = {
        from: 'info@eventushersconference.com.ng',
        to: email,
        subject: 'Registration Successful - Your Gate Pass',
        html: `
            <p>Dear ${user.name},</p>
            <p>Your registration was successful! Here are your details:</p>
            <p>${gatePass.replace(/\n/g, '<br>')}</p>
            <p>Thank you for registering! Join our WhatsApp group using the button below:</p>
            <a href="${JoinWhatsappLink}" style="background-color:#25D366;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
                Join WhatsApp Group
            </a>
            <p>We look forward to seeing you at the event!</p>
        `
    };

    await transporter.sendMail(mailOptions);
};


// Endpoint to serve the registration page
userRouter.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

// Endpoint to initiate registration and send verification email
userRouter.post('/register/initiate', async (req, res) => {
    const { name, email, tel } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists. Please use a different email.' });
        }

        const token = generateToken();
        tempUsers[email] = { name, email, tel, token, emailVerified: false };

        await sendVerificationEmail(name, email, token);

        res.status(200).json({ message: 'Verification email sent. Please check your email to verify.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during registration initiation.' });
    }
});

// Endpoint to verify email
userRouter.get('/register/verify-email', async (req, res) => {
    const { token, email } = req.query;

    try {
        const user = tempUsers[email];

        if (!user || user.token !== token) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        user.emailVerified = true;

        // Save user details to the database
        const newUser = new User({
            name: user.name,
            email: user.email,
            tel: user.tel,
            emailVerified: user.emailVerified
        });

        await newUser.save();

        await sendRegistrationDetails(email, newUser);

        // Remove the temporary user details
        delete tempUsers[email];

        res.redirect(`/user/register/success?email=${email}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during email verification.' });
    }
});

// Endpoint to serve the success page
userRouter.get('/register/success', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'success.html'));
});

module.exports = userRouter;
