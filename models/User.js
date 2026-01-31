const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['player', 'organizer'], default: 'player' },
  // NEW: Store UPI ID for receiving payments
  upiId: { type: String, default: '' } 
});

module.exports = mongoose.model('User', UserSchema);