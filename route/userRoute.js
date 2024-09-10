require('dotenv').config();
const express = require('express');
const axios = require('axios');
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
// Function to create the Nodemailer transporter
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

            <p>Thank you for registering with <strong>Event Ushers Conference</strong>. To complete your registration and activate your account, please verify your email address by clicking the link below:</p>
            
            <a href="${verificationLink}" 
                    style="background-color:#1a73e8;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
                    Verify Email Address
                </a>
            
            <p>If you did not create an account with us, please ignore this email.</p>

            <p>Best regards,</p>
            <p><strong>Event Ushers Conference Team</strong></p>

            <p style="font-size:12px;color:#888;">This is an automated message, please do not reply to this email. For assistance, contact our support team at info@eventushersconference.com.ng.</p>
        `
    };

    await transporter.sendMail(mailOptions);
}

// Function to send registration details email
const sendRegistrationDetails = async (email, user) => {
    const gatePass = `
        Name: ${user.name}
        Email: ${user.email}
        Tel: ${user.tel}
        Unique ID: ${user._id}
    `;

    let mailOptions = {
        from: 'info@eventushersconference.com.ng',
        to: email,
        subject: 'Registration Successful - Your Gate Pass',
        text: `Dear ${user.name},\n\nYour registration was successful! Here are your details:\n\n${gatePass}\n\nThank you for registering!`
    };

    await transporter.sendMail(mailOptions);
}
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
        tempUsers[email] = { name, email, tel, token, emailVerified: false, paymentVerified: false };

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

        res.redirect(`/user/register/payment?email=${email}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during email verification.' });
    }
});

// Endpoint to serve the payment page
userRouter.get('/register/payment', (req, res) => {
    const { email } = req.query;
    res.sendFile(path.join(__dirname, '..', 'public', 'payment.html'), { email });
});

// Endpoint to initiate payment with Paystack
userRouter.post('/initialize-payment', async (req, res) => {
    const { email } = req.body;

    try {
        console.log(`Initializing payment for email: ${email}`);
        console.log(`Paystack Secret Key: ${process.env.PAYSTACK_SECRET_KEY}`);

        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: email,
                amount: 5000 * 100, // 5,000 Naira in Kobo
                callback_url: `https://eventushersconference.com.ng/user/register/verify-payment?email=${email}`
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: agent // Add the custom agent here
            }
        );

        console.log('Paystack response:', response.data);

        res.status(200).json({
            status: true,
            message: 'Payment initialized successfully',
            data: response.data
        });
    } catch (error) {
        console.error('Error initializing payment:', error.response ? error.response.data : error.message);
        res.status(500).json({
            status: false,
            message: 'Payment initialization failed',
            error: error.response ? error.response.data : error.message
        });
    }
});

// Endpoint to verify payment
userRouter.get('/register/verify-payment', async (req, res) => {
    const { email, reference } = req.query;

    try {
        console.log(`Verifying payment for email: ${email} with reference: ${reference}`);

        const user = tempUsers[email];

        if (!user || !user.emailVerified) {
            return res.status(400).json({ message: 'Email not verified or user does not exist.' });
        }

        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            },
            httpsAgent: agent // Add the custom agent here
        });

        console.log('Paystack verify response:', response.data);

        if (response.data.data.status === 'success') {
            user.paymentVerified = true;

            // Save user details to the database
            const newUser = new User({
                name: user.name,
                email: user.email,
                tel: user.tel,
                emailVerified: user.emailVerified,
                paymentVerified: user.paymentVerified
            });

            await newUser.save();

            await sendRegistrationDetails(email, newUser);

            // Remove the temporary user details
            delete tempUsers[email];

            res.redirect(`/user/register/success?email=${email}`);
        } else {
            res.status(400).json({ message: 'Payment verification failed.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during payment verification.' });
    }
});

// Endpoint to serve the success page
userRouter.get('/register/success', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'success.html'));
});

module.exports = userRouter;
