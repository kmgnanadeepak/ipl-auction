const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  bidderSession: { type: String, required: true },
  bidderName: { type: String, required: true },
  bidderColor: { type: String, default: '#FFD700' },
  amount: { type: Number, required: true },
  auctionSession: { type: String, default: 'default' },
}, { timestamps: true });

bidSchema.index({ player: 1, createdAt: -1 });
bidSchema.index({ bidderSession: 1 });

module.exports = mongoose.model('Bid', bidSchema);
