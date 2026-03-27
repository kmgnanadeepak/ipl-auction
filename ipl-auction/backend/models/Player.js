const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Player name is required'],
    trim: true
  },
  country: {
    type: String,
    required: true,
    default: 'India'
  },
  role: {
    type: String,
    required: true,
    enum: ['Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper']
  },
  battingStyle: {
    type: String,
    enum: ['Right-handed', 'Left-handed', ''],
    default: ''
  },
  bowlingStyle: {
    type: String,
    default: ''
  },
  basePrice: {
    type: Number,
    required: true // In Lakhs
  },
  rating: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    default: 'General'
  },
  iplTeam: {
    type: String,
    default: 'Did Not Play'
  },
  soldPrice: {
    type: Number,
    default: null
  },
  image: {
    type: String,
    default: ''
  },
  // Player Stats
  stats: {
    matches: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    average: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    battingAverage: { type: Number, default: 0 },
    bowlingAverage: { type: Number, default: 0 },
    fifties: { type: Number, default: 0 },
    hundreds: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['available', 'in_auction', 'sold', 'unsold'],
    default: 'available'
  },
  soldTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isCapped: {
    type: Boolean,
    default: true
  },
  isOverseas: {
    type: Boolean,
    default: false
  },
  auctionOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
playerSchema.index({ status: 1, role: 1 });

module.exports = mongoose.model('Player', playerSchema);
