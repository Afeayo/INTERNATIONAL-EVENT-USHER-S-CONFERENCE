const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const AdminRouter = express.Router();
const User = require('../models/user');
const Admin = require('../models/admin');
const Nominee = require('../models/nominee');
const Vote = require('../models/vote');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const { parse } = require('json2csv');

// Middleware to check if admin is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.admin) {
        return next();
    }
    res.redirect('/admin/login');
}

AdminRouter.use(express.json());
AdminRouter.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Set the directory for uploads
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Set the filename
    }
});
const upload = multer({ storage: storage });

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
        const totalRevenue = totalUsers * 10000;

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
AdminRouter.post('/nominees/edit/:id', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
        const { name, category, existingImage } = req.body;
        const image = req.file;

        if (!name) {
            console.error('Nominee name is required');
            return res.status(400).render('admin_edit_nominee', { nominee: req.body, error: 'Nominee name is required' });
        }

        const slug = generateSlug(name);
        const link = `/vote/${slug}`;

        const updateData = {
            name,
            category,
            slug,
            link,
            image: image ? `/uploads/${image.filename}` : existingImage
        };

        await Nominee.findByIdAndUpdate(req.params.id, updateData);
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
AdminRouter.post('/nominees/add', upload.single('image'), async (req, res) => {
    try {
        const { name, category } = req.body;
        const image = req.file;

        console.log('Request body:', req.body);
        if (!name) {
            console.error('Nominee name is required');
            return res.status(400).render('admin_add_nominee', { error: 'Nominee name is required' });
        }

        const slug = generateSlug(name);
        const link = `/vote/${slug}`;

        const newNominee = new Nominee({
            name,
            category,
            slug,
            link,
            image: image ? `/uploads/${image.filename}` : null
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

// Generate slug function
function generateSlug(text) {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}


// Route to handle displaying results
AdminRouter.get('/results', async (req, res) => {
    try {
        const nominees = await Nominee.find().sort({ votes: -1 });
        res.render('admin_results', { nominees });
    } catch (err) {
        console.error('Error fetching results:', err);
        res.status(500).send('<p>Server error. Please try again later.</p>');
    }
});

// Export data to CSV
AdminRouter.get('/download/nominees', async (req, res) => {
    try {
        const nominees = await Nominee.aggregate([
            { $match: {} },
            { $project: { name: 1, category: 1, votes: 1 } },
            { $sort: { votes: -1 } }
        ]);

        const fields = ['name', 'category', 'votes'];
        const opts = { fields };
        const csv = parse(nominees, opts); // Correct usage of parse

        res.header('Content-Type', 'text/csv');
        res.attachment('nominees.csv');
        res.send(csv);
    } catch (err) {
        console.error('Error exporting nominees to CSV:', err);
        res.status(500).json({ error: 'Failed to export nominees' });
    }
});

// Admin registration route
AdminRouter.get('/register',isAuthenticated,async (req, res) => {
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

// Route to get new users data
/*AdminRouter.get('/data/users', isAuthenticated, async (req, res) => {
    try {
        const dailyData = await User.aggregate([
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { "_id": 1 } }
        ]);

        const weeklyData = await User.aggregate([
            { $group: { _id: { $week: "$createdAt" }, count: { $sum: 1 } } },
            { $sort: { "_id": 1 } }
        ]);

        const monthlyData = await User.aggregate([
            { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
            { $sort: { "_id": 1 } }
        ]);

        res.json({ daily: dailyData, weekly: weeklyData, monthly: monthlyData });
    } catch (err) {
        console.error('Error fetching user data:', err);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});*/




// Route to get top nominees data
AdminRouter.get('/data/top-nominees', isAuthenticated, async (req, res) => {
    try {
        const topNominees = await Vote.aggregate([
            { $group: { _id: "$nomineeId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $lookup: { from: "nominees", localField: "_id", foreignField: "_id", as: "nominee" } },
            { $unwind: "$nominee" },
            { $project: { name: "$nominee.name", count: 1 } }
        ]);

        res.json(topNominees);
    } catch (err) {
        console.error('Error fetching top nominees data:', err);
        res.status(500).json({ error: 'Failed to fetch top nominees data' });
    }
});





/// Route to download users report
AdminRouter.get('/download/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find().lean();
        const fields = ['name', 'email', 'tel','createdAt'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(users);

        res.header('Content-Type', 'text/csv');
        res.attachment('users_report.csv');
        res.send(csv);
    } catch (err) {
        console.error('Error exporting users to CSV:', err);
        res.status(500).json({ error: 'Failed to export users' });
    }
});


AdminRouter.get('/download/nominees', isAuthenticated, async (req, res) => {
    try {
        const nominees = await Nominee.aggregate([
            { $lookup: { from: 'votes', localField: '_id', foreignField: 'nomineeId', as: 'votes' } },
            { $addFields: { totalVotes: { $size: "$votes" } } }
        ]).lean();

        const fields = ['name', 'category', 'slug', 'link', 'totalVotes'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(nominees);

        res.header('Content-Type', 'text/csv');
        res.attachment('nominees_report.csv');
        res.send(csv);
    } catch (err) {
        console.error('Error exporting nominees to CSV:', err);
        res.status(500).json({ error: 'Failed to export nominees' });
    }
});



module.exports = AdminRouter;
