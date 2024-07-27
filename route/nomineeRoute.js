const express = require('express');
const nomineeRouter = express.Router();
const Nominee = require('../models/nominee');
const Vote = require('../models/vote');

// Middleware to check if a user has already voted for a nominee
async function hasVoted(req, res, next) {
    const { voterName, nomineeId } = req.body;
    const existingVote = await Vote.findOne({ voterName, nomineeId });

    if (existingVote) {
        req.error = 'You can only vote once.';
        return next();
    }

    next();
}

// Route to list nominees with pagination
nomineeRouter.get('/nominees', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const nominees = await Nominee.find().skip(skip).limit(limit);
        const count = await Nominee.countDocuments();

        res.render('nominee_list', {
            nominees,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            limit,
            error: req.error || null
        });
    } catch (err) {
        console.error('Error fetching nominees:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Route to handle voting
nomineeRouter.post('/vote', hasVoted, async (req, res) => {
    if (req.error) {
        return res.status(400).render('nominee_list', { error: req.error });
    }

    try {
        const { voterName, nomineeId } = req.body;

        if (!voterName || !nomineeId) {
            return res.status(400).render('error', { error: 'Voter name and nominee ID are required.' });
        }

        const nominee = await Nominee.findById(nomineeId);

        if (!nominee) {
            return res.status(404).render('error', { error: 'Nominee not found' });
        }

        const vote = new Vote({
            voterName,
            nomineeId
        });
        await vote.save();

        nominee.votes += 1;
        await nominee.save();

        res.render('thank_you', { message: 'Vote recorded successfully!' });
    } catch (err) {
        console.error('Error recording vote:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

module.exports = nomineeRouter;
