/**
 * Room-scoped auction controller
 * All auction state lives INSIDE the Room document (room.auction)
 * Timer state is kept in-memory per room code.
 */
const Room   = require('../models/Room');
const Player = require('../models/Player');
const { safeRoom } = require('../routes/rooms');
const { getBudgetAlert, getTeamSpendData } = require('../services/auctionInsightsService');

const timers = {};   // roomCode → intervalId

function broadcastAuctionInsights(io, roomCode, participants = []) {
  io.to(roomCode).emit('auction_heatmap_update', {
    spendData: getTeamSpendData(participants),
  });
}

function clearTimer(roomCode) {
  if (timers[roomCode]) { clearInterval(timers[roomCode]); delete timers[roomCode]; }
}

function startTimer(io, room, seconds) {
  clearTimer(room.roomCode);
  let rem = seconds;
  timers[room.roomCode] = setInterval(async () => {
    rem--;
    io.to(room.roomCode).emit('timer_update', { remaining: Math.max(0, rem) });
    if (rem <= 0) {
      clearTimer(room.roomCode);
      await handleExpiry(io, room.roomCode);
    }
  }, 1000);
}

function playerRating(player) {
  const st = player?.stats || {};
  const runs = Number(st.runs || 0);
  const avg = Number(st.avg || st.average || 0);
  const sr = Number(st.sr || st.strikeRate || 0);
  const wkts = Number(st.wkts || st.wickets || 0);
  const eco = Number(st.eco || st.economy || 0);
  const fifties = Number(st['50s'] || st.fifties || 0);
  const hundreds = Number(st['100s'] || st.hundreds || 0);
  const matches = Number(st.matches || 0);
  const cappedBonus = player?.isCapped ? 8 : 0;
  const overseasBonus = player?.isOverseas ? 4 : 0;
  const ecoScore = eco > 0 ? Math.max(0, 12 - eco) * 6 : 0;
  const rating =
    (runs / 120) + (avg * 1.4) + (sr / 6) + (wkts * 2.8) + ecoScore +
    (fifties * 2) + (hundreds * 4) + (matches / 18) + cappedBonus + overseasBonus;
  return Number(rating.toFixed(2));
}

function roleBalanceBonus(players) {
  const countByRole = {
    Batsman: 0,
    Bowler: 0,
    'All-rounder': 0,
    Wicketkeeper: 0,
  };
  (players || []).forEach((p) => {
    if (countByRole[p.role] != null) countByRole[p.role] += 1;
  });

  let bonus = 0;
  if (countByRole.Batsman >= 3) bonus += 10;
  if (countByRole.Bowler >= 3) bonus += 10;
  if (countByRole['All-rounder'] >= 2) bonus += 8;
  if (countByRole.Wicketkeeper >= 1) bonus += 6;
  const roleCoverage = Object.values(countByRole).filter(v => v > 0).length;
  if (roleCoverage === 4) bonus += 8;

  return Number(bonus.toFixed(2));
}

function addUnsoldPlayer(room, playerId) {
  const id = String(playerId);
  const exists = (room.auction.unsoldPlayers || []).some(p => String(p) === id);
  if (!exists) room.auction.unsoldPlayers.push(playerId);
}

function removeUnsoldPlayer(room, playerId) {
  const id = String(playerId);
  room.auction.unsoldPlayers = (room.auction.unsoldPlayers || []).filter(p => String(p) !== id);
}

function buildAuctionResults(room) {
  const soldMap = new Map();
  (room.auction.soldPlayers || []).forEach((s) => {
    const id = String(s?.player?._id || s?.player || '');
    if (id) soldMap.set(id, s.soldPrice || 0);
  });

  const valueRows = [];

  const rankings = (room.participants || []).map((p) => {
    const players = (p.squad || []).map((pl) => {
      const id = String(pl?._id || pl);
      const rating = playerRating(pl);
      const marketValue = Number((pl?.basePrice || 0) + (rating * 2.6)).toFixed(2);
      const soldPrice = soldMap.get(id) || 0;
      const valueDiff = Number((soldPrice - Number(marketValue)).toFixed(2));
      valueRows.push({
        playerName: pl?.name || 'Unknown',
        role: pl?.role || 'Unknown',
        teamName: p.teamName,
        soldPrice,
        basePrice: pl?.basePrice || 0,
        marketValue: Number(marketValue),
        valueDiff,
      });
      return {
        _id: pl?._id || pl,
        name: pl?.name || 'Unknown',
        role: pl?.role || 'Unknown',
        image: pl?.image || '',
        iplTeam: pl?.iplTeam || 'Did Not Play',
        soldPrice,
        rating,
        stats: {
          strikeRate: Number(pl?.stats?.strikeRate ?? pl?.stats?.sr ?? 0),
          average: Number(pl?.stats?.average ?? pl?.stats?.avg ?? 0),
          economy: Number(pl?.stats?.economy ?? pl?.stats?.eco ?? 0),
          battingAverage: Number(pl?.stats?.battingAverage ?? 0),
          bowlingAverage: Number(pl?.stats?.bowlingAverage ?? 0),
        },
      };
    });
    const baseScore = Number(players.reduce((sum, pl) => sum + (pl.rating || 0), 0).toFixed(2));
    const bonus = roleBalanceBonus(players);
    const score = Number((baseScore + bonus).toFixed(2));
    const totalSpent = (p.budget || room.config.budget || 0) - (p.remainingBudget || 0);
    return {
      sessionId: p.sessionId,
      teamName: p.teamName,
      color: p.color,
      score,
      baseScore,
      roleBalanceBonus: bonus,
      totalSpent,
      remainingBudget: p.remainingBudget || 0,
      players: players.sort((a, b) => (b.rating || 0) - (a.rating || 0)),
    };
  }).sort((a, b) =>
    b.score - a.score || b.remainingBudget - a.remainingBudget || a.totalSpent - b.totalSpent
  );

  const mostExpensive = [...(room.auction.soldPlayers || [])]
    .sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0))[0];
  const steals = [...valueRows]
    .sort((a, b) => a.valueDiff - b.valueDiff)
    .slice(0, 5)
    .map(v => ({ ...v, valueDiff: Number(v.valueDiff.toFixed(2)) }));
  const overpays = [...valueRows]
    .sort((a, b) => b.valueDiff - a.valueDiff)
    .slice(0, 5)
    .map(v => ({ ...v, valueDiff: Number(v.valueDiff.toFixed(2)) }));

  return {
    rankings,
    winner: rankings[0] ? { sessionId: rankings[0].sessionId, teamName: rankings[0].teamName, score: rankings[0].score } : null,
    runnerUp: rankings[1] ? { sessionId: rankings[1].sessionId, teamName: rankings[1].teamName, score: rankings[1].score } : null,
    thirdPlace: rankings[2] ? { sessionId: rankings[2].sessionId, teamName: rankings[2].teamName, score: rankings[2].score } : null,
    mostExpensivePlayer: mostExpensive ? {
      name: mostExpensive.player?.name || 'Unknown',
      role: mostExpensive.player?.role || 'Unknown',
      soldPrice: mostExpensive.soldPrice || 0,
      soldToName: mostExpensive.soldToName || 'Unknown',
    } : null,
    insights: { steals, overpays },
    generatedAt: new Date(),
  };
}

/* ── build player queue from config ─────────────────────────────── */
async function buildQueue(config) {
  const { playerOrder, categories } = config;
  let query = {};
  if (categories && categories.length) query.role = { $in: categories };

  let players = await Player.find(query).lean();

  if (playerOrder === 'category') {
    const order = ['Batsman','Wicketkeeper','All-rounder','Bowler'];
    players.sort((a,b) => {
      const ai = order.indexOf(a.role), bi = order.indexOf(b.role);
      if (ai !== bi) return ai - bi;
      return a.auctionOrder - b.auctionOrder;
    });
  } else {
    // Fisher-Yates shuffle
    for (let i = players.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [players[i],players[j]] = [players[j],players[i]];
    }
  }
  return players;
}

/* ── timer expiry ────────────────────────────────────────────────── */
async function handleExpiry(io, roomCode) {
  try {
    const room = await Room.findOne({ roomCode }).populate('auction.currentPlayer');
    if (!room || room.auction.status !== 'active') return;

    const player = room.auction.currentPlayer;
    if (!player) { await moveNext(io, roomCode); return; }

    const { currentHighestBidderSession: winSess, currentHighestBidderName: winName,
            currentHighestBidderColor: winColor, currentHighestBid: price } = room.auction;

    if (winSess) {
      // SOLD
      const part = room.participants.find(p => p.sessionId === winSess);
      if (part) {
        part.remainingBudget -= price;
        part.squad.push(player._id);
        room.markModified('participants');
      }
      await Player.findByIdAndUpdate(player._id, { status:'sold', soldPrice: price });

      room.auction.soldPlayers.push({
        player: player._id, soldToSession: winSess,
        soldToName: winName, soldToColor: winColor,
        soldPrice: price, soldAt: new Date(),
      });
      removeUnsoldPlayer(room, player._id);

      io.to(roomCode).emit('player_sold', {
        player, soldToName: winName, soldToColor: winColor, soldPrice: price,
        message: `${player.name} SOLD to ${winName} for ₹${price}L!`,
      });
      io.to(`${roomCode}:${winSess}`).emit('budget_update', {
        remainingBudget: part?.remainingBudget, newPlayer: player,
        budgetAlert: part ? getBudgetAlert(part.budget, part.remainingBudget) : null,
      });
    } else {
      // UNSOLD
      addUnsoldPlayer(room, player._id);
      io.to(roomCode).emit('player_unsold', {
        player, message: `${player.name} goes UNSOLD!`,
      });
    }

    await room.save();
    const refreshed = await Room.findOne({ roomCode })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player');
    io.to(roomCode).emit('room_updated', { room: safeRoom(refreshed) });
    broadcastAuctionInsights(io, roomCode, refreshed.participants || []);
    await moveNext(io, roomCode);
  } catch(err) { console.error('[timer expiry]', err.message); }
}

/* ── move to next player ─────────────────────────────────────────── */
async function moveNext(io, roomCode) {
  const room = await Room.findOne({ roomCode })
    .populate('participants.squad')
    .populate('auction.soldPlayers.player')
    .populate('auction.unsoldPlayers');
  if (!room) return;

  const queue = room.auction.playerQueue;
  if (!queue || queue.length === 0) {
    const unsoldCount = (room.auction.unsoldPlayers || []).length;
    if (room.auction.currentRound < (room.auction.maxRounds || 3) && unsoldCount > 0) {
      room.auction.status = 'round_break';
      room.auction.currentPlayer = null;
      room.auction.currentHighestBid = 0;
      room.auction.currentHighestBidderSession = null;
      room.auction.currentHighestBidderName = null;
      room.auction.currentHighestBidderColor = null;
      room.auction.timerStartedAt = null;
      room.auction.timerEndsAt = null;
      await room.save();
      const waiting = await Room.findOne({ roomCode })
        .populate('auction.currentPlayer')
        .populate('participants.squad')
        .populate('auction.soldPlayers.player')
        .populate('auction.unsoldPlayers');
      io.to(roomCode).emit('auction_round_ended', {
        room: safeRoom(waiting),
        round: room.auction.currentRound,
        unsoldCount,
      });
      io.to(roomCode).emit('room_updated', { room: safeRoom(waiting) });
    } else {
      room.auction.status = 'completed';
      room.status = 'completed';
      room.auction.currentPlayer = null;
      room.auction.results = buildAuctionResults(room);
      await room.save();
      const completed = await Room.findOne({ roomCode })
        .populate('auction.currentPlayer')
        .populate('participants.squad')
        .populate('auction.soldPlayers.player')
        .populate('auction.unsoldPlayers');
      io.to(roomCode).emit('auction_completed', {
        message: '🏆 Auction completed!',
        room: safeRoom(completed),
      });
      io.to(roomCode).emit('auction_results', {
        roomCode,
        results: completed.auction.results,
      });
    }
    return;
  }

  const nextId = queue.shift();
  const next   = await Player.findById(nextId).lean();
  const dur    = room.config.timerSeconds || 30;

  room.auction.currentPlayer             = next._id;
  room.auction.currentHighestBid         = next.basePrice;
  room.auction.currentHighestBidderSession = null;
  room.auction.currentHighestBidderName    = null;
  room.auction.currentHighestBidderColor   = null;
  room.auction.timerStartedAt = new Date();
  room.auction.timerEndsAt    = new Date(Date.now() + dur*1000);
  room.markModified('auction');
  await room.save();

  const fresh = await Room.findOne({ roomCode })
    .populate('auction.currentPlayer')
    .populate('participants.squad')
    .populate('auction.soldPlayers.player')
    .populate('auction.unsoldPlayers');
  io.to(roomCode).emit('next_player', { room: safeRoom(fresh), remainingTime: dur });
  startTimer(io, room, dur);
}

/* ══ EXPORTS ═════════════════════════════════════════════════════════ */

exports.startAuction = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { roomCode } = req.params;
    const { sessionId } = req.body;

    const room = await Room.findOne({ roomCode });
    if (!room)                         return res.status(404).json({ success:false, message:'Room not found' });
    if (room.hostSession !== sessionId) return res.status(403).json({ success:false, message:'Only the host can start the auction' });
    if (room.status !== 'lobby')        return res.status(400).json({ success:false, message:'Auction already started' });
    if (room.participants.length < 1)   return res.status(400).json({ success:false, message:'At least 1 participant required' });

    const players = await buildQueue(room.config);
    if (!players.length) return res.status(400).json({ success:false, message:'No players match the selected categories' });

    // Sync budget from config
    room.participants.forEach(p => { p.budget = room.config.budget; p.remainingBudget = room.config.budget; });
    room.markModified('participants');

    const first = players[0];
    const dur   = room.config.timerSeconds || 30;

    room.status = 'auction';
    room.auction.status      = 'active';
    room.auction.currentRound = 1;
    room.auction.maxRounds = 3;
    room.auction.playerQueue = players.slice(1).map(p=>p._id);
    room.auction.soldPlayers  = [];
    room.auction.unsoldPlayers= [];
    room.auction.results = null;
    room.auction.bidHistory   = [];
    room.auction.currentPlayer             = first._id;
    room.auction.currentHighestBid         = first.basePrice;
    room.auction.currentHighestBidderSession = null;
    room.auction.currentHighestBidderName    = null;
    room.auction.currentHighestBidderColor   = null;
    room.auction.timerStartedAt = new Date();
    room.auction.timerEndsAt    = new Date(Date.now() + dur*1000);
    room.markModified('auction');
    await room.save();

    const fresh = await Room.findOne({ roomCode })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player')
      .populate('auction.unsoldPlayers');
    console.log('[auction] emitting auction_started', {
      roomCode,
      clientsInRoom: io.sockets.adapter.rooms.get(roomCode)?.size || 0,
      status: fresh?.auction?.status,
    });
    io.to(roomCode).emit('auction_started', { room: safeRoom(fresh), remainingTime: dur });
    broadcastAuctionInsights(io, roomCode, fresh.participants || []);
    startTimer(io, room, dur);

    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.pauseAuction = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { sessionId } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room || room.hostSession !== sessionId)
      return res.status(403).json({ success:false, message:'Host only' });
    clearTimer(roomCode);
    room.auction.status = 'paused';
    await room.save();
    req.app.get('io').to(roomCode).emit('auction_paused', { message:'Auction paused by host' });
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.resumeAuction = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { roomCode } = req.params;
    const { sessionId } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room || room.hostSession !== sessionId)
      return res.status(403).json({ success:false, message:'Host only' });
    const dur = room.config.timerSeconds || 30;
    room.auction.status = 'active';
    room.auction.timerStartedAt = new Date();
    room.auction.timerEndsAt    = new Date(Date.now() + dur*1000);
    await room.save();
    io.to(roomCode).emit('auction_resumed', { remainingTime: dur });
    startTimer(io, room, dur);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.skipPlayer = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { sessionId } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room || room.hostSession !== sessionId)
      return res.status(403).json({ success:false, message:'Host only' });
    clearTimer(roomCode);
    room.auction.unsoldPlayers.push(room.auction.currentPlayer);
    room.markModified('auction');
    await room.save();
    req.app.get('io').to(roomCode).emit('player_unsold', { message:'Player skipped by host' });
    await moveNext(req.app.get('io'), roomCode);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.nextPlayer = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { sessionId } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room || room.hostSession !== sessionId)
      return res.status(403).json({ success:false, message:'Host only' });
    clearTimer(roomCode);
    await handleExpiry(req.app.get('io'), roomCode);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.placeBid = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { roomCode } = req.params;
    const { sessionId, amount } = req.body;

    if (!sessionId || !amount)
      return res.status(400).json({ success:false, message:'sessionId and amount required' });

    const room = await Room.findOne({ roomCode });
    if (!room || room.auction.status !== 'active')
      return res.status(400).json({ success:false, message:'Auction is not active' });

    const part = room.participants.find(p => p.sessionId === sessionId);
    if (!part) return res.status(403).json({ success:false, message:'You are not in this room' });

    const cur = room.auction.currentHighestBid;
    if (room.auction.currentHighestBidderSession === sessionId)
      return res.status(400).json({ success:false, message:'You are already the highest bidder!' });
    if (amount <= cur)
      return res.status(400).json({ success:false, message:`Bid must exceed ₹${cur}L` });

    // Increment rules
    const minInc = cur<200?10:cur<500?20:cur<1000?50:cur<2000?100:200;
    if (amount < cur + minInc)
      return res.status(400).json({ success:false, message:`Minimum increment is ₹${minInc}L` });

    if (part.remainingBudget < amount)
      return res.status(400).json({ success:false, message:`Insufficient budget (₹${part.remainingBudget}L left)` });

    const dur = room.config.timerSeconds || 30;
    room.auction.currentHighestBid             = amount;
    room.auction.currentHighestBidderSession   = sessionId;
    room.auction.currentHighestBidderName      = part.teamName;
    room.auction.currentHighestBidderColor     = part.color;
    room.auction.timerStartedAt = new Date();
    room.auction.timerEndsAt    = new Date(Date.now() + dur*1000);
    room.auction.bidHistory.push({
      playerName:    room.auction.currentPlayer?.name || '',
      bidderSession: sessionId,
      bidderName:    part.teamName,
      bidderColor:   part.color,
      amount,
      timestamp:     new Date(),
    });
    room.markModified('auction');
    await room.save();

    startTimer(io, room, dur);

    io.to(roomCode).emit('new_bid', {
      bidderName:  part.teamName,
      bidderColor: part.color,
      bidderSession: sessionId,
      amount,
      currentHighestBid: amount,
      remainingTime: dur,
    });

    res.json({
      success: true,
      message: `Bid of ₹${amount}L placed!`,
      budget: {
        totalBudget: part.budget,
        remainingBudget: part.remainingBudget,
        alert: getBudgetAlert(part.budget, part.remainingBudget),
      },
    });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.endRound = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { roomCode } = req.params;
    const { sessionId } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room) return res.status(404).json({ success:false, message:'Room not found' });
    if (room.hostSession !== sessionId) return res.status(403).json({ success:false, message:'Host only' });
    if (!['active','paused'].includes(room.auction.status)) {
      return res.status(400).json({ success:false, message:'Round is not active' });
    }

    clearTimer(roomCode);
    const pendingIds = [
      ...(room.auction.currentPlayer ? [room.auction.currentPlayer] : []),
      ...(room.auction.playerQueue || []),
    ];
    pendingIds.forEach(id => addUnsoldPlayer(room, id));
    room.auction.playerQueue = [];
    room.auction.currentPlayer = null;
    room.auction.currentHighestBid = 0;
    room.auction.currentHighestBidderSession = null;
    room.auction.currentHighestBidderName = null;
    room.auction.currentHighestBidderColor = null;
    room.auction.timerStartedAt = null;
    room.auction.timerEndsAt = null;

    const unsoldCount = (room.auction.unsoldPlayers || []).length;
    if (room.auction.currentRound >= (room.auction.maxRounds || 3) || unsoldCount === 0) {
      room.auction.status = 'completed';
      room.status = 'completed';
      await room.populate('participants.squad');
      await room.populate('auction.soldPlayers.player');
      await room.populate('auction.unsoldPlayers');
      room.auction.results = buildAuctionResults(room);
      await room.save();
      io.to(roomCode).emit('auction_completed', { message:'🏆 Auction completed!', room: safeRoom(room) });
      io.to(roomCode).emit('auction_results', { roomCode, results: room.auction.results });
      return res.json({ success:true, completed:true, round: room.auction.currentRound });
    }

    room.auction.status = 'round_break';
    await room.save();
    const refreshed = await Room.findOne({ roomCode })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player')
      .populate('auction.unsoldPlayers');
    io.to(roomCode).emit('auction_round_ended', {
      room: safeRoom(refreshed),
      round: refreshed.auction.currentRound,
      unsoldCount: (refreshed.auction.unsoldPlayers || []).length,
    });
    io.to(roomCode).emit('room_updated', { room: safeRoom(refreshed) });
    return res.json({ success:true, completed:false, round: refreshed.auction.currentRound });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.startNextRound = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { roomCode } = req.params;
    const { sessionId, selectedPlayerIds } = req.body;
    const room = await Room.findOne({ roomCode });
    if (!room) return res.status(404).json({ success:false, message:'Room not found' });
    if (room.hostSession !== sessionId) return res.status(403).json({ success:false, message:'Host only' });
    if (room.auction.status !== 'round_break') return res.status(400).json({ success:false, message:'Round break required' });
    if (room.auction.currentRound >= (room.auction.maxRounds || 3)) {
      return res.status(400).json({ success:false, message:'Maximum rounds reached' });
    }
    if (!Array.isArray(selectedPlayerIds) || selectedPlayerIds.length === 0) {
      return res.status(400).json({ success:false, message:'Select at least one player' });
    }

    const unsoldSet = new Set((room.auction.unsoldPlayers || []).map(id => String(id)));
    const selected = selectedPlayerIds.map(String).filter(id => unsoldSet.has(id));
    if (selected.length === 0) return res.status(400).json({ success:false, message:'No valid unsold players selected' });

    const firstId = selected[0];
    const firstPlayer = await Player.findById(firstId).lean();
    if (!firstPlayer) return res.status(400).json({ success:false, message:'First selected player not found' });
    const dur = room.config.timerSeconds || 30;
    room.auction.currentRound += 1;
    room.auction.status = 'active';
    room.auction.currentPlayer = firstId;
    room.auction.playerQueue = selected.slice(1);
    room.auction.currentHighestBid = firstPlayer.basePrice || 0;
    room.auction.currentHighestBidderSession = null;
    room.auction.currentHighestBidderName = null;
    room.auction.currentHighestBidderColor = null;
    room.auction.timerStartedAt = new Date();
    room.auction.timerEndsAt = new Date(Date.now() + dur * 1000);
    room.status = 'auction';
    room.markModified('auction');
    await room.save();

    const fresh = await Room.findOne({ roomCode })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player')
      .populate('auction.unsoldPlayers');
    io.to(roomCode).emit('next_round_started', {
      room: safeRoom(fresh),
      round: fresh.auction.currentRound,
      remainingTime: dur,
    });
    io.to(roomCode).emit('room_updated', { room: safeRoom(fresh) });
    startTimer(io, room, dur);
    return res.json({ success:true, round: fresh.auction.currentRound });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() })
      .populate('auction.currentPlayer')
      .populate('participants.squad')
      .populate('auction.soldPlayers.player')
      .populate('auction.unsoldPlayers');
    if (!room) return res.status(404).json({ success:false, message:'Room not found' });
    let remainingTime = 0;
    if (room.auction.timerEndsAt && room.auction.status === 'active')
      remainingTime = Math.max(0, Math.floor((new Date(room.auction.timerEndsAt)-Date.now())/1000));
    res.json({ success:true, room: safeRoom(room), remainingTime });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};
