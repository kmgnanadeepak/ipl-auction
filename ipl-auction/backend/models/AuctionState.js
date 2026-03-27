const mongoose = require('mongoose');

const auctionStateSchema = new mongoose.Schema({
  sessionId: { type: String, default: 'default', unique: true },
  status: { type: String, enum: ['idle','active','paused','completed'], default: 'idle' },
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  currentHighestBid: { type: Number, default: 0 },
  currentHighestBidderSession: { type: String, default: null },
  currentHighestBidderName: { type: String, default: null },
  currentHighestBidderColor: { type: String, default: null },
  timerDuration: { type: Number, default: 30 },
  timerStartedAt: { type: Date, default: null },
  timerEndsAt: { type: Date, default: null },
  playerQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  soldPlayers: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    soldToSession: String, soldToName: String, soldToColor: String,
    soldPrice: Number, soldAt: { type: Date, default: Date.now }
  }],
  unsoldPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  bidHistory: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    bidderSession: String, bidderName: String, bidderColor: String,
    amount: Number, timestamp: { type: Date, default: Date.now }
  }],
  adminSessionId: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AuctionState', auctionStateSchema);
