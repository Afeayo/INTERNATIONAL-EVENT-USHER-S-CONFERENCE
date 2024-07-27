const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
    voterName: { type: String, required: true },
    voterEmail: { type: String, required: true },
    nomineeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Nominee', required: true },
    votedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vote', voteSchema);
