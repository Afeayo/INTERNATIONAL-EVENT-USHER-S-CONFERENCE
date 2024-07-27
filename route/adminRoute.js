const express = require('express');
const bcrypt = require('bcrypt');
const AdminRouter = express.Router();
const User = require('../models/user');
const Admin = require('../models/admin');
const Nominee = require('../models/nominee');
const Vote = require('../models/vote');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

// Middleware to check if admin is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.admin) {
        return next();
    }
    res.redirect('/admin/login');
}

// Get new users per day/week/month
AdminRouter.get('/data/users', async (req, res) => {
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
        console.error('Error fetching users data:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Get total revenue
AdminRouter.get('/data/total-revenue', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalRevenue = totalUsers * 5000; // 5000 Naira per user

        res.json({ total: totalRevenue });
    } catch (err) {
        console.error('Error fetching total revenue:', err);
        res.status(500).json({ error: 'Failed to fetch revenue' });
    }
});

// Get top 10 nominees
AdminRouter.get('/data/top-nominees', async (req, res) => {
    try {
        const topNominees = await Vote.aggregate([
            { $group: { _id: "$nomineeId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $lookup: { from: "nominees", localField: "_id", foreignField: "_id", as: "nominee" } },
            { $unwind: "$nominee" },
            { $project: { _id: 0, name: "$nominee.name", category: "$nominee.category", count: 1 } }
        ]);

        res.json(topNominees);
    } catch (err) {
        console.error('Error fetching top nominees:', err);
        res.status(500).json({ error: 'Failed to fetch top nominees' });
    }
});

// Admin login
AdminRouter.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const admin = await Admin.findOne({
            $or: [
                { username: identifier },
                { email: identifier }
            ]
        });

        if (admin && await bcrypt.compare(password, admin.password)) {
            req.session.admin = admin;
            res.redirect('/admin');
        } else {
            res.render('admin_login', { error: 'Invalid username/email or password' });
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).render('admin_login', { error: 'Server error' });
    }
});

// Admin login page
AdminRouter.get('/login', (req, res) => {
    res.render('admin_login', { error: null });
});

// Admin logout
AdminRouter.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Admin dashboard
AdminRouter.get('/', isAuthenticated, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalRevenue = totalUsers * 5000;

        const topNominees = await Vote.aggregate([
            { $group: { _id: "$nomineeId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $lookup: { from: "nominees", localField: "_id", foreignField: "_id", as: "nominee" } },
            { $unwind: "$nominee" },
            { $project: { _id: 0, name: "$nominee.name", category: "$nominee.category", count: 1 } }
        ]);

        res.render('admin', {
            admin: req.session.admin,
            totalUsers,
            totalRevenue,
            topNominees
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Admin users page
AdminRouter.get('/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin_users', { users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Admin nominees page with pagination
AdminRouter.get('/nominees', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const nominees = await Nominee.find().skip(skip).limit(limit);
        const count = await Nominee.countDocuments();

        res.render('admin_nominees', {
            nominees,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            limit
        });
    } catch (err) {
        console.error('Error fetching nominees:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Edit nominee page
AdminRouter.get('/nominees/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const nominee = await Nominee.findById(req.params.id);
        res.render('admin_edit_nominee', { nominee });
    } catch (err) {
        console.error('Error fetching nominee:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Edit nominee submission
AdminRouter.post('/nominees/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const { name, category } = req.body;
        const slug = generateSlug(name);
        const link = `/vote/${slug}`;

        await Nominee.findByIdAndUpdate(req.params.id, { name, category, slug, link });
        res.redirect('/admin/nominees');
    } catch (err) {
        console.error('Error updating nominee:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Add nominee page
AdminRouter.get('/nominees/add', isAuthenticated, (req, res) => {
    res.render('admin_add_nominee');
});

// Add nominee submission
AdminRouter.post('/nominees/add', async (req, res) => {
    try {
        const { name, category } = req.body;
        const slug = generateSlug(name);
        const link = `/vote/${slug}`;

        const newNominee = new Nominee({
            name,
            category,
            slug,
            link
        });

        await newNominee.save();
        res.redirect('/admin/nominees');
    } catch (err) {
        console.error('Error adding nominee:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Delete user
AdminRouter.post('/users/delete', isAuthenticated, async (req, res) => {
    const { userId } = req.body;
    try {
        await User.findByIdAndDelete(userId);
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Delete nominee
AdminRouter.post('/nominees/delete', isAuthenticated, async (req, res) => {
    const { nomineeId } = req.body;
    try {
        await Nominee.findByIdAndDelete(nomineeId);
        res.redirect('/admin/nominees');
    } catch (err) {
        console.error('Error deleting nominee:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Results page
AdminRouter.get('/results', isAuthenticated, async (req, res) => {
    try {
        const nominees = await Nominee.find();
        res.render('admin_results', { nominees });
    } catch (err) {
        console.error('Error fetching results:', err);
        res.status(500).render('error', { error: 'Server error' });
    }
});

// Download user report
AdminRouter.get('/download/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find();
        const fields = ['_id', 'name', 'email', 'createdAt'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(users);

        res.header('Content-Type', 'text/csv');
        res.attachment('users_report.csv');
        return res.send(csv);
    } catch (err) {
        console.error('Error downloading user report:', err);
        res.status(500).send('Server error');
    }
});

// Download nominee result
AdminRouter.get('/download/nominees', isAuthenticated, async (req, res) => {
    try {
        const nominees = await Vote.aggregate([
            { $group: { _id: "$nomineeId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $lookup: { from: "nominees", localField: "_id", foreignField: "_id", as: "nominee" } },
            { $unwind: "$nominee" },
            { $project: { _id: 0, name: "$nominee.name", category: "$nominee.category", count: 1 } }
        ]);

        const fields = ['name', 'category', 'count'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(nominees);

        res.header('Content-Type', 'text/csv');
        res.attachment('nominees_results.csv');
        return res.send(csv);
    } catch (err) {
        console.error('Error downloading nominee results:', err);
        res.status(500).send('Server error');
    }
});

function generateSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

// Admin registration route
AdminRouter.get('/register', (req, res) => {
    res.render('admin_register', { error: null });
});

AdminRouter.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    console.log('Registration attempt with:', { username, email }); // Debug log

    const existingAdmin = await Admin.findOne({
        $or: [
            { username: username },
            { email: email }
        ]
    });
   
    if (existingAdmin) {
        return res.render('admin_register', { error: 'User with this username or email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, email, password: hashedPassword });

    try {
        await newAdmin.save();
        console.log('Admin registered:', newAdmin); // Debug log
        res.redirect('/admin/login');
    } catch (error) {
        console.error('Registration error:', error); // Debug log
        res.render('admin_register', { error: 'Registration failed. Please try again.' });
    }
});



module.exports = AdminRouter;
