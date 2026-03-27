const express = require('express');
const router = express.Router();
const Guest = require('../models/Guest');
const Player = require('../models/Player');
const Bid = require('../models/Bid');
const { requireGuest, requireAdmin } = require('../middleware/session');

router.get('/stats', requireGuest, requireAdmin, async (req, res) => {
  try {
    const [total, sold, unsold, teams, bids] = await Promise.all([
      Player.countDocuments(),
      Player.countDocuments({ status: 'sold' }),
      Player.countDocuments({ status: 'unsold' }),
      Guest.countDocuments({ role: 'guest' }),
      Bid.countDocuments(),
    ]);
    const spent = await Player.aggregate([
      { $match: { status: 'sold' } },
      { $group: { _id: null, total: { $sum: '$soldPrice' } } }
    ]);
    res.json({ success: true, stats: {
      totalPlayers: total, soldPlayers: sold, unsoldPlayers: unsold,
      availablePlayers: total - sold - unsold, totalTeams: teams,
      totalBids: bids, moneySpent: spent[0]?.total || 0,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/guests', requireGuest, requireAdmin, async (req, res) => {
  try {
    const guests = await Guest.find().populate('squad', 'name role').select('-sessionId');
    res.json({ success: true, guests });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/timer', requireGuest, requireAdmin, async (req, res) => {
  try {
    const AuctionState = require('../models/AuctionState');
    const { duration } = req.body;
    await AuctionState.findOneAndUpdate({ sessionId: 'default' }, { timerDuration: duration }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/promote — make a guest an admin
router.post('/promote', async (req, res) => {
  try {
    const { sessionId, adminKey } = req.body;
    if (adminKey !== (process.env.ADMIN_KEY || 'ipl_admin_2024'))
      return res.status(403).json({ success: false, message: 'Invalid admin key' });
    const guest = await Guest.findOneAndUpdate({ sessionId }, { role: 'admin' }, { new: true });
    if (!guest) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, message: `${guest.teamName} promoted to admin` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
