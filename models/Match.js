const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  name: String,
  role: { type: String, default: 'All-Rounder' },
  skill: Number,
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Paid'], 
    default: 'Pending' 
  },
});

const CommentSchema = new mongoose.Schema({
  user: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const MatchSchema = new mongoose.Schema({
  title: String,
  turfName: String,
  date: Date,
  costPerHour: Number,
  durationHours: Number,
  players: [PlayerSchema],
  comments: [CommentSchema],
  createdBy: String, // Organizer ID
  result: {
    winner: String,
    score: String,
    isCompleted: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);