const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    tel: { type: String, required: true },
    emailVerified: { type: Boolean, required: true },
    paymentVerified: { type: Boolean, required: true }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
