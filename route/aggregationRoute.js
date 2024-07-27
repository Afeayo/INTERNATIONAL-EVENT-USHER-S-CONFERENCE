const express = require('express');
const adminRouter = express.Router();
const User = require('../models/user');
const Vote = require('../models/vote');
const Nominee = require('../models/nominee');
const Payment = require('../models/payment');

// Get new users per day/week/month
adminRouter.get('/data/users', async (req, res) => {
    try {
        const newUserDaily = await User.aggregate([
            { $group: { _id: { $dayOfYear: "$createdAt" }, count: { $sum: 1 } } }
        ]);
        const newUserWeekly = await User.aggregate([
            { $group: { _id: { $week: "$createdAt" }, count: { $sum: 1 } } }
        ]);
        const newUserMonthly = await User.aggregate([
            { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } }
        ]);

        const totalUsers = await User.countDocuments();

        res.json({
            daily: newUserDaily,
            weekly: newUserWeekly,
            monthly: newUserMonthly,
            total: totalUsers
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Get total revenue
adminRouter.get('/data/revenue', async (req, res) => {
    try {
        const totalRevenue = await Payment.aggregate([
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        res.json(totalRevenue);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch revenue' });
    }
});

// Get top 10 nominees
adminRouter.get('/data/top-nominees', async (req, res) => {
    try {
        const topNominees = await Vote.aggregate([
            { $group: { _id: "$nomineeId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $lookup: { from: "nominees", localField: "_id", foreignField: "_id", as: "nominee" } },
            { $unwind: "$nominee" }
        ]);

        res.json(topNominees);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch top nominees' });
    }
});

module.exports = adminRouter;
