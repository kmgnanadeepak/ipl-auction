const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Guest = require('../models/Guest');
const { requireGuest } = require('../middleware/session');

const TEAM_COLORS = [
  '#FFD700','#FF6B00','#004BA0','#1B5E20','#B71C1C',
  '#4A148C','#006064','#F57F17','#880E4F','#01579B',
  '#33691E','#827717','#E65100','#BF360C','#37474F',
];

/**
 * POST /api/session/join
 * Create a new guest session or return existing if sessionId provided.
 * Body: { teamName, sessionId? }
 */
router.post('/join', async (req, res) => {
  try {
    const { teamName, sessionId } = req.body;

    // ── Rejoin with existing session ────────────────────────────────────────
    if (sessionId) {
      const existing = await Guest.findOne({ sessionId }).populate('squad', 'name role basePrice soldPrice country image');
      if (existing) {
        await Guest.findByIdAndUpdate(existing._id, { lastSeen: new Date(), isOnline: true });
        return res.json({
          success: true,
          guest: sanitize(existing),
          message: `Welcome back, ${existing.teamName}!`,
        });
      }
      // Session expired/not found – fall through to create new
    }

    // ── Validate team name ───────────────────────────────────────────────────
    if (!teamName || teamName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Team name must be at least 2 characters' });
    }
    const cleaned = teamName.trim().slice(0, 40);

    // Check duplicate team name (case-insensitive)
    const duplicate = await Guest.findOne({ teamName: { $regex: `^${escapeRegex(cleaned)}$`, $options: 'i' } });
    if (duplicate) {
      return res.status(409).json({ success: false, message: `Team name "${cleaned}" is already taken. Choose another.` });
    }

    // ── Create new guest ─────────────────────────────────────────────────────
    const newId = uuidv4();
    const color = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];

    const guest = await Guest.create({
      sessionId: newId,
      teamName: cleaned,
      color,
      budget: 10000,
      remainingBudget: 10000,
      role: 'guest',
      isOnline: true,
    });

    return res.status(201).json({
      success: true,
      guest: sanitize(guest),
      message: `Welcome, ${guest.teamName}! You have ₹100 Cr to build your squad.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/session/me
 * Return current guest info (requires X-Session-ID header).
 */
router.get('/me', requireGuest, async (req, res) => {
  res.json({ success: true, guest: sanitize(req.guest) });
});

/**
 * PUT /api/session/team-name
 * Update team name (must be unique).
 */
router.put('/team-name', requireGuest, async (req, res) => {
  try {
    const { teamName } = req.body;
    if (!teamName || teamName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid team name' });
    }
    const cleaned = teamName.trim().slice(0, 40);
    const dup = await Guest.findOne({
      teamName: { $regex: `^${escapeRegex(cleaned)}$`, $options: 'i' },
      _id: { $ne: req.guest._id },
    });
    if (dup) return res.status(409).json({ success: false, message: 'Team name already taken' });
    await Guest.findByIdAndUpdate(req.guest._id, { teamName: cleaned });
    res.json({ success: true, message: 'Team name updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/session/check-name?name=xyz
 * Check if a team name is available.
 */
router.get('/check-name', async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ available: false });
    const exists = await Guest.findOne({ teamName: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
    res.json({ available: !exists });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sanitize(g) {
  const obj = g.toObject ? g.toObject() : g;
  return {
    id: obj._id,
    sessionId: obj.sessionId,
    teamName: obj.teamName,
    color: obj.color,
    budget: obj.budget,
    remainingBudget: obj.remainingBudget,
    role: obj.role,
    squad: obj.squad || [],
    squadCount: (obj.squad || []).length,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
