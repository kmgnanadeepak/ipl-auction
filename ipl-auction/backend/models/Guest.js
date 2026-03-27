const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
  // Unique identifier stored in browser localStorage
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  teamName: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    maxlength: [40, 'Team name too long'],
  },
  // Display color assigned randomly
  color: {
    type: String,
    default: '#FFD700',
  },
  budget: {
    type: Number,
    default: 10000, // 100 Cr in Lakhs
  },
  remainingBudget: {
    type: Number,
    default: 10000,
  },
  squad: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
  }],
  // Role: 'admin' guests have full auction control
  role: {
    type: String,
    enum: ['guest', 'admin'],
    default: 'guest',
  },
  // Last seen timestamp for cleanup
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Update lastSeen on activity
guestSchema.methods.touch = function () {
  this.lastSeen = new Date();
  return this.save();
};

module.exports = mongoose.model('Guest', guestSchema);
