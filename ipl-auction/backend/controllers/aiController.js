const Room = require('../models/Room');
const { getSuggestion } = require('../services/auctionInsightsService');

exports.getRoomSuggestion = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() }).populate('participants.squad');
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const team = room.participants.find((p) => p.sessionId === sessionId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found in room' });

    const suggestion = getSuggestion(team, {
      totalBudget: team.budget,
      remainingBudget: team.remainingBudget,
    });

    return res.json({ success: true, suggestion });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
