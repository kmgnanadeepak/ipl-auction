const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room   = require('../models/Room');
const Player = require('../models/Player');
const { getBudgetAlert, getTeamSpendData } = require('../services/auctionInsightsService');

const COLORS = ['#FFD700','#FF6B00','#004BA0','#1B5E20','#B71C1C',
                '#4A148C','#006064','#F57F17','#880E4F','#01579B',
                '#33691E','#E65100','#BF360C','#37474F','#4CAF50'];

/* ── helpers ───────────────────────────────────────────────────── */
function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
async function uniqueCode() {
  for (let i=0;i<20;i++) {
    const c = makeRoomCode();
    if (!await Room.exists({roomCode:c})) return c;
  }
  throw new Error('Could not generate unique room code');
}
function pickColor(taken=[]) {
  const free = COLORS.filter(c=>!taken.includes(c));
  return (free.length ? free : COLORS)[Math.floor(Math.random()*(free.length||COLORS.length))];
}

/* ── POST /api/rooms/create ─────────────────────────────────────── */
router.post('/create', async (req, res) => {
  try {
    const { roomName, teamName, sessionId } = req.body;
    if (!roomName?.trim() || !teamName?.trim() || !sessionId)
      return res.status(400).json({ success:false, message:'roomName, teamName and sessionId are required' });

    const roomCode = await uniqueCode();
    const color    = pickColor();

    const room = await Room.create({
      roomCode,
      roomName: roomName.trim().slice(0,40),
      hostSession: sessionId,
      participants: [{
        sessionId, teamName: teamName.trim().slice(0,30),
        color, isHost:true, isOnline:true,
        budget:10000, remainingBudget:10000,
      }],
    });

    res.status(201).json({ success:true, room: safeRoom(room), roomCode });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

/* ── POST /api/rooms/join ───────────────────────────────────────── */
router.post('/join', async (req, res) => {
  try {
    const { roomCode, teamName, sessionId } = req.body;
    if (!roomCode?.trim() || !teamName?.trim() || !sessionId)
      return res.status(400).json({ success:false, message:'roomCode, teamName and sessionId are required' });

    const room = await Room.findOne({ roomCode: roomCode.trim().toUpperCase() });
    if (!room)        return res.status(404).json({ success:false, message:'Room not found. Check the code.' });
    if (room.status !== 'lobby')
      return res.status(400).json({ success:false, message:'This room\'s auction has already started.' });
    if (room.participants.length >= room.maxParticipants)
      return res.status(400).json({ success:false, message:`Room is full (${room.maxParticipants} teams max).` });

    // Re-join existing participant
    const existing = room.participants.find(p => p.sessionId === sessionId);
    if (existing) {
      existing.isOnline = true;
      await room.save();
      return res.json({ success:true, room: safeRoom(room), rejoined:true });
    }

    // Duplicate team name
    const nameTaken = room.participants.some(p =>
      p.teamName.toLowerCase() === teamName.trim().toLowerCase());
    if (nameTaken)
      return res.status(409).json({ success:false, message:`"${teamName.trim()}" is already taken in this room.` });

    const takenColors = room.participants.map(p=>p.color);
    const budget = room.config.budget || 10000;

    room.participants.push({
      sessionId, teamName: teamName.trim().slice(0,30),
      color: pickColor(takenColors),
      isHost:false, isOnline:true,
      budget, remainingBudget: budget,
    });
    await room.save();

    res.json({ success:true, room: safeRoom(room) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

/* ── GET /api/rooms/:code ──────────────────────────────────────── */
router.get('/:code', async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.code.toUpperCase() })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player')
      .populate('auction.unsoldPlayers');
    if (!room) return res.status(404).json({ success:false, message:'Room not found' });
    res.json({ success:true, room: safeRoom(room) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

/* ── PUT /api/rooms/:code/config ───────────────────────────────── */
router.put('/:code/config', async (req, res) => {
  try {
    let { sessionId, config } = req.body;
    const room = await Room.findOne({ roomCode: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ success:false, message:'Room not found' });
    if (room.hostSession !== sessionId)
      return res.status(403).json({ success:false, message:'Only the host can change settings' });
    if (room.status !== 'lobby')
      return res.status(400).json({ success:false, message:'Cannot change config after auction starts' });

    // Validate & apply
    // In some deployments, frontend may send `config` as a JSON string via form-encoding.
    // Support both shapes: { config: { ... } } and { config: "{"budget":...}" }.
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch (_) {}
    }
    if (!config || typeof config !== 'object') config = {};

    const allowed = { budget:[5000,7500,10000,15000,20000], squadSize:[11,15,20,25], timerSeconds:[10,20,30,60] };
    if (config.budget     && allowed.budget.includes(config.budget))      room.config.budget      = config.budget;
    if (config.squadSize  && allowed.squadSize.includes(config.squadSize)) room.config.squadSize   = config.squadSize;
    if (config.timerSeconds && allowed.timerSeconds.includes(config.timerSeconds)) room.config.timerSeconds = config.timerSeconds;
    if (['random','category'].includes(config.playerOrder)) room.config.playerOrder = config.playerOrder;
    if (Array.isArray(config.categories) && config.categories.length > 0) room.config.categories = config.categories;

    // Sync budget to all participants
    room.participants.forEach(p => { p.budget = room.config.budget; p.remainingBudget = room.config.budget; });
    room.markModified('participants');
    await room.save();

    const io = req.app.get('io');
    io.to(room.roomCode).emit('config_updated', { config: room.config });
    io.to(room.roomCode).emit('room_updated', { room: safeRoom(room) });

    res.json({ success:true, config: room.config });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

/* ── safe serialiser (never expose sessionIds publicly) ─────────── */
function safeRoom(room) {
  const obj = room.toObject ? room.toObject() : room;
  const spendData = getTeamSpendData(obj.participants || []);
  return {
    _id:         obj._id,
    roomCode:    obj.roomCode,
    roomName:    obj.roomName,
    status:      obj.status,
    maxParticipants: obj.maxParticipants,
    config:      obj.config,
    hostSession: obj.hostSession,     // FE needs to compare with own sessionId
    participants: (obj.participants||[]).map(p => ({
      teamName:  p.teamName,
      color:     p.color,
      isHost:    p.isHost,
      isOnline:  p.isOnline,
      sessionId: p.sessionId,         // needed for host/self checks on FE
      budget:    p.budget,
      remainingBudget: p.remainingBudget,
      budgetAlert: getBudgetAlert(p.budget, p.remainingBudget),
      squadSize: (p.squad||[]).length,
      squad: (p.squad || []).map(sp => ({
        _id: sp?._id || sp,
        name: sp?.name || 'Unknown',
        role: sp?.role || 'Unknown',
        image: sp?.image || '',
        iplTeam: sp?.iplTeam || 'Did Not Play',
        rating: sp?.rating || 0,
        basePrice: sp?.basePrice || 0,
        stats: sp?.stats || {},
      })),
    })),
    auction: {
      ...obj.auction,
      spendData,
      soldPlayers: (obj.auction?.soldPlayers || []).map(s => ({
        ...s,
        player: s?.player ? {
          _id: s.player._id || s.player,
          name: s.player.name || 'Unknown',
          role: s.player.role || 'Unknown',
          image: s.player.image || '',
          iplTeam: s.player.iplTeam || 'Did Not Play',
          rating: s.player.rating || 0,
          basePrice: s.player.basePrice || 0,
          stats: s.player.stats || {},
        } : null,
      })),
      unsoldPlayerPool: (obj.auction?.unsoldPlayers || []).map(p => ({
        _id: p?._id || p,
        name: p?.name || 'Unknown',
        role: p?.role || 'Unknown',
        image: p?.image || '',
        basePrice: p?.basePrice || 0,
        iplTeam: p?.iplTeam || 'Did Not Play',
        rating: p?.rating || 0,
        stats: p?.stats || {},
      })),
    },
    createdAt:   obj.createdAt,
  };
}

module.exports = router;
module.exports.safeRoom = safeRoom;
