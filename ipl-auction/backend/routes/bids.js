const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const AuctionState = require('../models/AuctionState');
const Guest = require('../models/Guest');
const { requireGuest } = require('../middleware/session');

function getMinIncrement(bid) {
  if (bid < 200) return 10;
  if (bid < 500) return 20;
  if (bid < 1000) return 50;
  if (bid < 2000) return 100;
  return 200;
}

// POST /api/bids
router.post('/', requireGuest, async (req, res) => {
  try {
    const { amount } = req.body;
    const io = req.app.get('io');
    const guest = req.guest;

    const state = await AuctionState.findOne({ sessionId: 'default' });
    if (!state || state.status !== 'active')
      return res.status(400).json({ success: false, message: 'Auction is not active' });
    if (!state.currentPlayer)
      return res.status(400).json({ success: false, message: 'No player up for auction' });
    if (state.currentHighestBidderSession === guest.sessionId)
      return res.status(400).json({ success: false, message: 'You are already the highest bidder!' });
    if (!amount || amount <= state.currentHighestBid)
      return res.status(400).json({ success: false, message: `Bid must exceed ₹${state.currentHighestBid}L` });

    const minInc = getMinIncrement(state.currentHighestBid);
    if (amount < state.currentHighestBid + minInc)
      return res.status(400).json({ success: false, message: `Minimum increment is ₹${minInc}L` });

    const freshGuest = await Guest.findOne({ sessionId: guest.sessionId });
    if ((freshGuest?.remainingBudget || 0) < amount)
      return res.status(400).json({ success: false, message: `Insufficient budget (₹${freshGuest?.remainingBudget || 0}L available)` });

    await Bid.create({
      player: state.currentPlayer,
      bidderSession: guest.sessionId,
      bidderName: guest.teamName,
      bidderColor: guest.color,
      amount,
    });

    const dur = state.timerDuration || 30;
    state.currentHighestBid = amount;
    state.currentHighestBidderSession = guest.sessionId;
    state.currentHighestBidderName = guest.teamName;
    state.currentHighestBidderColor = guest.color;
    state.timerEndsAt = new Date(Date.now() + dur * 1000);
    state.timerStartedAt = new Date();
    state.bidHistory.push({
      player: state.currentPlayer,
      bidderSession: guest.sessionId,
      bidderName: guest.teamName,
      bidderColor: guest.color,
      amount,
      timestamp: new Date(),
    });
    await state.save();

    const { startCountdown } = require('../controllers/auctionController');
    startCountdown(io, dur);

    io.emit('new_bid', {
      bidderName: guest.teamName,
      bidderColor: guest.color,
      bidderSession: guest.sessionId,
      amount,
      currentHighestBid: amount,
      remainingTime: dur,
    });

    res.json({ success: true, message: `Bid of ₹${amount}L placed!`, amount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/player/:id', async (req, res) => {
  try {
    const bids = await Bid.find({ player: req.params.id }).sort({ createdAt: -1 }).limit(30);
    res.json({ success: true, bids });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/me', requireGuest, async (req, res) => {
  try {
    const bids = await Bid.find({ bidderSession: req.guest.sessionId })
      .populate('player', 'name role image').sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, bids });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
