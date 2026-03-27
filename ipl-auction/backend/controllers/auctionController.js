const AuctionState = require('../models/AuctionState');
const Player = require('../models/Player');
const Guest = require('../models/Guest');
const Bid = require('../models/Bid');

// ── In-memory timer ──────────────────────────────────────────────────────────
let countdownInterval = null;

function clearCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function startCountdown(io, seconds) {
  clearCountdown();
  let remaining = seconds;
  countdownInterval = setInterval(async () => {
    remaining--;
    io.emit('timer_update', { remaining: Math.max(0, remaining) });
    if (remaining <= 0) { clearCountdown(); await handleTimerExpiry(io); }
  }, 1000);
}

async function getState() {
  let s = await AuctionState.findOne({ sessionId: 'default' }).populate('currentPlayer');
  if (!s) s = await AuctionState.create({ sessionId: 'default' });
  return s;
}

async function handleTimerExpiry(io) {
  try {
    const state = await AuctionState.findOne({ sessionId: 'default' }).populate('currentPlayer');
    if (!state || state.status !== 'active' || !state.currentPlayer) return;
    const player = state.currentPlayer;

    if (state.currentHighestBidderSession) {
      const bidder = await Guest.findOne({ sessionId: state.currentHighestBidderSession });
      const soldPrice = state.currentHighestBid;
      await Player.findByIdAndUpdate(player._id, { status: 'sold', soldTo: bidder?._id || null, soldPrice });
      if (bidder) {
        await Guest.findByIdAndUpdate(bidder._id, {
          $push: { squad: player._id }, $inc: { remainingBudget: -soldPrice }
        });
        io.to(`session:${bidder.sessionId}`).emit('budget_update', {
          remainingBudget: bidder.remainingBudget - soldPrice, newPlayer: player
        });
      }
      state.soldPlayers.push({
        player: player._id, soldToSession: state.currentHighestBidderSession,
        soldToName: state.currentHighestBidderName, soldToColor: state.currentHighestBidderColor,
        soldPrice, soldAt: new Date()
      });
      io.emit('player_sold', {
        player, soldToName: state.currentHighestBidderName,
        soldToColor: state.currentHighestBidderColor, soldPrice,
        message: `${player.name} SOLD to ${state.currentHighestBidderName} for ₹${soldPrice}L!`
      });
    } else {
      await Player.findByIdAndUpdate(player._id, { status: 'unsold' });
      state.unsoldPlayers.push(player._id);
      io.emit('player_unsold', { player, message: `${player.name} goes UNSOLD!` });
    }
    await moveToNextPlayer(io, state);
  } catch (err) { console.error('Timer expiry error:', err.message); }
}

async function moveToNextPlayer(io, state) {
  if (!state.playerQueue || state.playerQueue.length === 0) {
    state.status = 'completed'; state.currentPlayer = null;
    state.currentHighestBid = 0; state.currentHighestBidderSession = null;
    state.currentHighestBidderName = null;
    await state.save();
    io.emit('auction_completed', { message: '🏆 Auction completed! All players have been auctioned.' });
    return;
  }
  const nextId = state.playerQueue.shift();
  const next = await Player.findByIdAndUpdate(nextId, { status: 'in_auction' }, { new: true });
  state.currentPlayer = next._id; state.currentHighestBid = next.basePrice;
  state.currentHighestBidderSession = null; state.currentHighestBidderName = null; state.currentHighestBidderColor = null;
  const dur = state.timerDuration || 30;
  state.timerStartedAt = new Date(); state.timerEndsAt = new Date(Date.now() + dur * 1000);
  await state.save();
  const fresh = await AuctionState.findOne({ sessionId: 'default' }).populate('currentPlayer');
  io.emit('next_player', { state: fresh, remainingTime: dur });
  startCountdown(io, dur);
}

exports.getAuctionState = async (req, res) => {
  try {
    const state = await getState();
    let remainingTime = 0;
    if (state.timerEndsAt && state.status === 'active')
      remainingTime = Math.max(0, Math.floor((new Date(state.timerEndsAt) - Date.now()) / 1000));
    res.json({ success: true, state, remainingTime });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.startAuction = async (req, res) => {
  try {
    const io = req.app.get('io');
    let state = await AuctionState.findOne({ sessionId: 'default' }) || new AuctionState({ sessionId: 'default' });
    const players = await Player.find({ status: 'available' }).sort({ auctionOrder: 1, name: 1 });
    if (!players.length) return res.status(400).json({ success: false, message: 'No available players' });
    const first = players[0];
    state.playerQueue = players.slice(1).map(p => p._id);
    state.status = 'active'; state.soldPlayers = []; state.unsoldPlayers = []; state.bidHistory = [];
    state.currentPlayer = first._id; state.currentHighestBid = first.basePrice;
    state.currentHighestBidderSession = null; state.currentHighestBidderName = null; state.currentHighestBidderColor = null;
    const dur = state.timerDuration || 30;
    state.timerStartedAt = new Date(); state.timerEndsAt = new Date(Date.now() + dur * 1000);
    await state.save();
    await Player.findByIdAndUpdate(first._id, { status: 'in_auction' });
    const pop = await AuctionState.findOne({ sessionId: 'default' }).populate('currentPlayer');
    io.emit('auction_started', { state: pop, remainingTime: dur });
    startCountdown(io, dur);
    res.json({ success: true, state: pop });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.pauseAuction = async (req, res) => {
  try {
    clearCountdown();
    await AuctionState.findOneAndUpdate({ sessionId: 'default' }, { status: 'paused' });
    req.app.get('io').emit('auction_paused', { message: 'Auction paused by admin' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.resumeAuction = async (req, res) => {
  try {
    const state = await AuctionState.findOne({ sessionId: 'default' });
    const dur = state.timerDuration || 30;
    state.status = 'active'; state.timerStartedAt = new Date(); state.timerEndsAt = new Date(Date.now() + dur * 1000);
    await state.save();
    req.app.get('io').emit('auction_resumed', { remainingTime: dur });
    startCountdown(req.app.get('io'), dur);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.skipPlayer = async (req, res) => {
  try {
    clearCountdown();
    const state = await AuctionState.findOne({ sessionId: 'default' });
    if (state.currentPlayer) await Player.findByIdAndUpdate(state.currentPlayer, { status: 'available' });
    await moveToNextPlayer(req.app.get('io'), state);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.nextPlayer = async (req, res) => {
  try { clearCountdown(); await handleTimerExpiry(req.app.get('io')); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.stopAuction = async (req, res) => {
  try {
    clearCountdown();
    await AuctionState.findOneAndUpdate({ sessionId: 'default' }, { status: 'idle', currentPlayer: null });
    req.app.get('io').emit('auction_stopped', { message: 'Auction stopped by admin' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.resetAuction = async (req, res) => {
  try {
    clearCountdown();
    await Player.updateMany({}, { status: 'available', soldTo: null, soldPrice: null });
    await Guest.updateMany({ role: 'guest' }, { $set: { remainingBudget: 10000, squad: [] } });
    await Bid.deleteMany({});
    await AuctionState.findOneAndUpdate({ sessionId: 'default' }, {
      status: 'idle', currentPlayer: null, currentHighestBid: 0,
      currentHighestBidderSession: null, currentHighestBidderName: null, currentHighestBidderColor: null,
      playerQueue: [], soldPlayers: [], unsoldPlayers: [], bidHistory: []
    }, { upsert: true });
    req.app.get('io').emit('auction_reset', { message: 'Auction has been fully reset!' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.startCountdown = startCountdown;
exports.clearCountdown = clearCountdown;
