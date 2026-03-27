const express = require('express');
const router = express.Router();
const Guest = require('../models/Guest');

router.get('/', async (req, res) => {
  try {
    const teams = await Guest.find({ role: 'guest' })
      .populate('squad', 'name role basePrice soldPrice country image')
      .sort({ squad: -1 })
      .select('-sessionId'); // never expose sessionId publicly
    res.json({ success: true, teams });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const team = await Guest.findById(req.params.id)
      .populate('squad', 'name role basePrice soldPrice country image stats battingStyle bowlingStyle isOverseas isCapped')
      .select('-sessionId');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, team });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
