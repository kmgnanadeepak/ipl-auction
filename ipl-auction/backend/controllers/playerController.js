const Player = require('../models/Player');

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

    const players = await Player.find(query)
      .populate('soldTo', 'name teamName color')
      .sort({ auctionOrder: 1, name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Player.countDocuments(query);

    res.json({ success: true, players, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single player
exports.getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).populate('soldTo', 'name teamName color');
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
