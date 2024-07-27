const mongoose = require('mongoose');

const nomineeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    image: { type: String, required: true },
    votes: { type: Number, default: 0 },
    slug: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('Nominee', nomineeSchema);
