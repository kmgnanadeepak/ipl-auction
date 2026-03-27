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
const botTimers = {}; // roomCode → timeoutId
const botLocks = {};  // roomCode → lastBotBidAt (ms)

function normalizePlayerFromJson(p = {}) {
  return {
    name: p.name,
    country: p.country || 'India',
    role: p.role,
    battingStyle: p.batting || p.battingStyle || '',
    bowlingStyle: p.bowling || p.bowlingStyle || '',
    basePrice: Number(p.basePrice || 0),
    rating: Number(p.rating ?? 0),
    category: p.category || 'General',
    iplTeam: p.iplTeam || 'Did Not Play',
    isCapped: Boolean(p.isCapped),
    isOverseas: Boolean(p.isOverseas),
    image: p.image || '',
    status: p.status || 'available',
    auctionOrder: Number(p.auctionOrder) || 0,
    stats: {
      matches: Number(p.stats?.matches ?? p.stats?.m ?? 0),
      runs: Number(p.stats?.runs ?? p.stats?.r ?? 0),
      average: Number(p.stats?.average ?? p.stats?.avg ?? 0),
      strikeRate: Number(p.stats?.strikeRate ?? p.stats?.sr ?? 0),
      wickets: Number(p.stats?.wickets ?? p.stats?.wkts ?? 0),
      economy: Number(p.stats?.economy ?? p.stats?.eco ?? 0),
      battingAverage: Number(p.stats?.battingAverage ?? p.stats?.batAvg ?? p.stats?.average ?? p.stats?.avg ?? 0),
      bowlingAverage: Number(p.stats?.bowlingAverage ?? p.stats?.bowlAvg ?? 0),
      fifties: Number(p.stats?.fifties ?? p.stats?.['50s'] ?? 0),
      hundreds: Number(p.stats?.hundreds ?? p.stats?.['100s'] ?? 0),
    },
    soldPrice: p.soldPrice ?? null,
    soldTo: p.soldTo ?? null,
  };
}

async function ensurePlayersSeededFromJson() {
  const count = await Player.countDocuments();
  if (count > 0) return { seeded: false, count };
  const raw = require('../config/players.json');
  const source = Array.isArray(raw) ? raw : [];
  const valid = source.filter(x => x?.name && x?.role && x?.country && x?.basePrice != null);
  const docs = valid.map(normalizePlayerFromJson);
  if (!docs.length) return { seeded: false, count: 0 };
  await Player.insertMany(docs, { ordered: false });
  const nextCount = await Player.countDocuments();
  console.log('[auction] seeded players from players.json:', nextCount);
  return { seeded: true, count: nextCount };
}

function broadcastAuctionInsights(io, roomCode, participants = []) {
  io.to(roomCode).emit('auction_heatmap_update', {
    spendData: getTeamSpendData(participants),
  });
}

function clearBotTimer(roomCode) {
  if (botTimers[roomCode]) { clearTimeout(botTimers[roomCode]); delete botTimers[roomCode]; }
}

function clamp01(n) { return Math.max(0, Math.min(1, Number(n || 0))); }
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function minIncrement(cur) {
  return cur < 200 ? 10 : cur < 500 ? 20 : cur < 1000 ? 50 : cur < 2000 ? 100 : 200;
}

function countRoles(players) {
  const c = { Batsman: 0, Bowler: 0, 'All-rounder': 0, Wicketkeeper: 0 };
  (players || []).forEach(p => { if (c[p?.role] != null) c[p.role] += 1; });
  return c;
}

function targetRoleBoost(playerRole, teamPlayers = []) {
  const c = countRoles(teamPlayers);
  if (playerRole === 'Wicketkeeper') return c.Wicketkeeper >= 1 ? 0 : 0.12;
  if (playerRole === 'All-rounder') return c['All-rounder'] >= 2 ? 0 : 0.10;
  if (playerRole === 'Bowler') return c.Bowler >= 4 ? 0 : 0.08;
  if (playerRole === 'Batsman') return c.Batsman >= 4 ? 0 : 0.08;
  return 0;
}

function computeMarketValue(player) {
  const rating = playerRating(player);
  const base = Number(player?.basePrice || 0);
  return base + (rating * 2.6);
}

async function placeBidInternal({ io, roomCode, sessionId, amount, isBot = false }) {
  const room = await Room.findOne({ roomCode }).populate('auction.currentPlayer');
  if (!room || room.auction.status !== 'active') {
    return { ok: false, message: 'Auction is not active' };
  }
  const part = room.participants.find(p => p.sessionId === sessionId);
  if (!part) return { ok: false, message: 'Bidder not in room' };

  const cur = room.auction.currentHighestBid || 0;
  if (room.auction.currentHighestBidderSession === sessionId) {
    return { ok: false, message: 'Already highest bidder' };
  }
  if (amount <= cur) return { ok: false, message: 'Bid must exceed current' };
  const inc = minIncrement(cur);
  if (amount < cur + inc) return { ok: false, message: 'Minimum increment not met' };
  if ((part.remainingBudget || 0) < amount) return { ok: false, message: 'Insufficient budget' };

  const dur = room.config.timerSeconds || 30;
  room.auction.currentHighestBid = amount;
  room.auction.currentHighestBidderSession = sessionId;
  room.auction.currentHighestBidderName = part.teamName;
  room.auction.currentHighestBidderColor = part.color;
  room.auction.timerStartedAt = new Date();
  room.auction.timerEndsAt = new Date(Date.now() + dur * 1000);
  room.auction.bidHistory.push({
    playerName: room.auction.currentPlayer?.name || '',
    bidderSession: sessionId,
    bidderName: part.teamName,
    bidderColor: part.color,
    amount,
    timestamp: new Date(),
  });
  room.markModified('auction');
  await room.save();

  startTimer(io, room, dur);
  io.to(roomCode).emit('new_bid', {
    bidderName: part.teamName,
    bidderColor: part.color,
    bidderSession: sessionId,
    amount,
    currentHighestBid: amount,
    remainingTime: dur,
    isBot: !!isBot,
  });

  triggerBotBids(io, roomCode, { reason: 'bid' }).catch(() => {});

  return {
    ok: true,
    budget: {
      totalBudget: part.budget,
      remainingBudget: part.remainingBudget,
      alert: getBudgetAlert(part.budget, part.remainingBudget),
    },
  };
}

async function triggerBotBids(io, roomCode, { reason } = {}) {
  clearBotTimer(roomCode);

  const now = Date.now();
  const last = botLocks[roomCode] || 0;
  if (now - last < 650) return;

  const room = await Room.findOne({ roomCode })
    .populate('auction.currentPlayer')
    .populate('participants.squad');
  if (!room || room.auction.status !== 'active') return;
  if (!room.aiEnabled) return;
  const player = room.auction.currentPlayer;
  if (!player) return;

  const bots = (room.participants || []).filter(p => p.isBot);
  if (bots.length === 0) return;

  const cur = room.auction.currentHighestBid || 0;
  const inc = minIncrement(cur);
  const nextBid = cur + inc;
  const winSess = room.auction.currentHighestBidderSession;

  const timeLeftSec = room.auction.timerEndsAt
    ? Math.max(0, Math.floor((new Date(room.auction.timerEndsAt) - Date.now()) / 1000))
    : 0;
  if (timeLeftSec <= 1) return;

  const mv = computeMarketValue(player);
  const star = (player?.rating || 0) >= 85 || playerRating(player) >= 85;

  const seed = (Number(String(room._id).slice(-6), 16) || 12345)
    ^ (Number(String(player._id).slice(-6), 16) || 67890)
    ^ (cur * 97);
  const rnd = mulberry32(seed);

  const playersDone = (room.auction?.soldPlayers?.length || 0) + (room.auction?.unsoldPlayers?.length || 0);
  const stage = playersDone < 40 ? 'early' : playersDone < 160 ? 'mid' : 'late';

  const candidates = bots
    .filter(b => b.sessionId !== winSess)
    .map(b => {
      const prof = b.botProfile || {};
      const kind = prof.kind || 'wildcard';
      const aggression = clamp01(prof.aggression ?? 0.5);
      const thrift = clamp01(prof.thrift ?? 0.5);
      const randomness = clamp01(prof.randomness ?? 0.25);

      const teamPlayers = b.squad || [];
      const roleBoost = targetRoleBoost(player.role, teamPlayers);
      const budget = Number(b.budget || room.config?.budget || 10000);
      const rem = Number(b.remainingBudget || 0);
      const squadSize = Number(room.config?.squadSize || 15);
      const slotsLeft = Math.max(0, squadSize - (teamPlayers?.length || 0));

      // Keep reserve for remaining slots (simple but effective)
      const reservePerSlot = stage === 'late' ? 120 : stage === 'mid' ? 160 : 220;
      const minReserve = Math.max(0, (slotsLeft - 1) * reservePerSlot);
      const spendable = Math.max(0, rem - minReserve);

      let capMult = 1.0;
      if (kind === 'aggressive_star') capMult = star ? 1.10 : 0.98;
      if (kind === 'budget_conscious') capMult = star ? 0.92 : 0.82;
      if (kind === 'role_balancer') capMult = 0.95 + roleBoost;
      if (kind === 'wildcard') capMult = 0.88 + (rnd() * 0.28);

      // Realistic expected range: value anchored to mv + role need, bounded by purse pressure.
      const clutch = timeLeftSec <= 5 ? 0.03 : timeLeftSec <= 10 ? 0.015 : 0;
      const stageMult = stage === 'early' ? 1.02 : stage === 'mid' ? 0.98 : 0.92;
      const needMult = 1 + (roleBoost * 0.85);
      const valueCap = mv * capMult * needMult * stageMult * (0.96 + clutch);

      // Hard stop limits: never dump full purse into one player
      const maxPctOfBudget = star ? (stage === 'early' ? 0.32 : 0.28) : 0.22;
      const hardCap = budget * maxPctOfBudget;

      const cap = Math.min(rem, spendable, hardCap, Math.max(nextBid, valueCap));

      const affordability = (b.remainingBudget || 0) >= nextBid;
      const tooExpensive = nextBid > cap;

      // Human-like dropouts: some bids are skipped even if affordable/value-positive
      const skipChance = clamp01((thrift * 0.12) + (stage === 'late' ? 0.10 : 0.05));

      const baseChance =
        0.42 +
        (star ? 0.12 : 0) +
        (roleBoost * 0.75) +
        (aggression * 0.22) -
        (thrift * 0.26);
      const chance = clamp01(baseChance + ((rnd() - 0.5) * randomness));

      const willBid = affordability && !tooExpensive && rnd() < chance && rnd() > skipChance;

      let step = inc;
      if (kind === 'aggressive_star' && star && rnd() < 0.45) step = inc * 2;
      if (kind === 'wildcard' && rnd() < 0.25) step = inc * (rnd() < 0.5 ? 2 : 3);
      const amount = Math.min(Math.round((cur + step) / 10) * 10, Math.floor(cap / 10) * 10);

      return { sessionId: b.sessionId, willBid, amount, cap, remaining: b.remainingBudget || 0 };
    })
    .filter(c => c.willBid && c.amount >= nextBid);

  if (candidates.length === 0) return;
  candidates.sort((a, b) => (b.cap - a.cap) || (b.remaining - a.remaining));
  const pickIdx = Math.min(candidates.length - 1, Math.floor(rnd() * Math.min(3, candidates.length)));
  const chosen = candidates[pickIdx];

  const minDelay = timeLeftSec <= 5 ? 350 : 700;
  const maxDelay = timeLeftSec <= 5 ? 950 : 2200;
  const delay = Math.floor(minDelay + rnd() * (maxDelay - minDelay));

  botTimers[roomCode] = setTimeout(async () => {
    botLocks[roomCode] = Date.now();
    await placeBidInternal({ io, roomCode, sessionId: chosen.sessionId, amount: chosen.amount, isBot: true });
  }, delay);
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

  await ensurePlayersSeededFromJson();
  let players = await Player.find(query).lean();
  console.log('[auction] buildQueue', {
    categories: categories?.length ? categories : 'all',
    playerOrder,
    found: players.length,
  });

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
    clearBotTimer(roomCode);
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
  clearBotTimer(roomCode);
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
  triggerBotBids(io, roomCode, { reason: 'next_player' }).catch(() => {});
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
    console.log('[auction] startAuction queue built', { roomCode, players: players.length });

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
    triggerBotBids(io, roomCode, { reason: 'auction_started' }).catch(() => {});

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
    clearBotTimer(roomCode);
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
    triggerBotBids(io, roomCode, { reason: 'auction_resumed' }).catch(() => {});
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
    clearBotTimer(roomCode);
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
    clearBotTimer(roomCode);
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

    const result = await placeBidInternal({ io, roomCode, sessionId, amount, isBot: false });
    if (!result.ok) return res.status(400).json({ success: false, message: result.message || 'Bid failed' });

    res.json({ success: true, message: `Bid of ₹${amount}L placed!`, budget: result.budget });
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
    clearBotTimer(roomCode);
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
    triggerBotBids(io, roomCode, { reason: 'next_round_started' }).catch(() => {});
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
