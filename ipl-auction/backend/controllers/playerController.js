const Player = require('../models/Player');
const { attachLiveTeamsToPlayers } = require('../services/iplTeamsService');
const { mapPlayersWithLiveTeams } = require('../services/liveIplTeamService');
const mongoose = require('mongoose');

function maybePopulateSoldTo(q) {
  // Player Comparison (and most guest flows) don't require User population.
  // Guard against MissingSchemaError if User isn't registered in some deployments.
  if (mongoose.models?.User) return q.populate('soldTo', 'name teamName color');
  return q;
}

// Get all players with filters
exports.getPlayers = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role && role !== 'all') query.role = role;
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { iplTeam: { $regex: search, $options: 'i' } }
      ];
    }

    const q = Player.find(query)
      .sort({ auctionOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const players = await maybePopulateSoldTo(q);

    const total = await Player.countDocuments(query);
    console.log('[players] fetch', {
      query,
      page: Number(page),
      limit: Number(limit),
      returned: players.length,
      total,
    });

    res.json({ success: true, players, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('[players] fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all players with live IPL 2026 teams attached (non-persistent)
exports.getPlayersWithLiveTeams = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role && role !== 'all') query.role = role;
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { iplTeam: { $regex: search, $options: 'i' } },
      ];
    }

    const q = Player.find(query)
      .sort({ auctionOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const players = await maybePopulateSoldTo(q);

    const total = await Player.countDocuments(query);

    // Attach live IPL team from external API, falling back to existing iplTeam / DNP
    const enriched = await attachLiveTeamsToPlayers(players);

    res.json({
      success: true,
      players: enriched,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[players] fetch-with-live-teams error:', error);
    // If anything goes wrong (API down, etc.), fall back to the normal list
    try {
      const { role, status, search, page = 1, limit = 50 } = req.query;
      const query = {};
      if (role && role !== 'all') query.role = role;
      if (status && status !== 'all') query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { country: { $regex: search, $options: 'i' } },
          { iplTeam: { $regex: search, $options: 'i' } },
        ];
      }
      const q = Player.find(query)
        .sort({ auctionOrder: 1, name: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      const players = await maybePopulateSoldTo(q);
      const total = await Player.countDocuments(query);
      res.json({
        success: true,
        players,
        total,
        pages: Math.ceil(total / limit),
        fallback: true,
      });
    } catch (inner) {
      console.error('[players] fallback fetch error:', inner);
      res.status(500).json({ success: false, message: inner.message });
    }
  }
};

// Get players with live IPL team mapping
exports.getPlayersWithTeams = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 50, refresh = 'false' } = req.query;
    const query = {};

    if (role && role !== 'all') query.role = role;
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { iplTeam: { $regex: search, $options: 'i' } },
      ];
    }

    const q = Player.find(query)
      .sort({ auctionOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const players = await maybePopulateSoldTo(q);

    const total = await Player.countDocuments(query);
    const mapped = await mapPlayersWithLiveTeams(players, {
      forceRefresh: String(refresh).toLowerCase() === 'true',
    });

    res.json({
      success: true,
      players: mapped.players,
      total,
      pages: Math.ceil(total / limit),
      source: mapped.source,
      upstreamError: mapped.error || null,
    });
  } catch (error) {
    console.error('[players-with-teams] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single player
exports.getPlayer = async (req, res) => {
  try {
    const q = Player.findById(req.params.id);
    const player = await maybePopulateSoldTo(q);
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });
    res.json({ success: true, player });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create player (admin only)
exports.createPlayer = async (req, res) => {
  try {
    const player = await Player.create(req.body);
    res.status(201).json({ success: true, player });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update player (admin only)
exports.updatePlayer = async (req, res) => {
  try {
    const player = await Player.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });

    // Emit socket update
    const io = req.app.get('io');
    io.emit('player_updated', player);

    res.json({ success: true, player });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete player (admin only)
exports.deletePlayer = async (req, res) => {
  try {
    const player = await Player.findByIdAndDelete(req.params.id);
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });
    res.json({ success: true, message: 'Player deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
