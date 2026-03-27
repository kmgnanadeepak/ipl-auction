const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  sessionId:  { type: String, required: true },
  teamName:   { type: String, required: true },
  color:      { type: String, default: '#FFD700' },
  isHost:     { type: Boolean, default: false },
  isBot:      { type: Boolean, default: false },
  botProfile: {
    kind: { type: String, default: null }, // aggressive_star | budget_conscious | role_balancer | wildcard
    aggression: { type: Number, default: 0.5 }, // 0..1
    thrift:     { type: Number, default: 0.5 }, // 0..1
    randomness: { type: Number, default: 0.25 }, // 0..1
  },
  isOnline:   { type: Boolean, default: true },
  joinedAt:   { type: Date, default: Date.now },
  budget:     { type: Number, default: 10000 },
  remainingBudget: { type: Number, default: 10000 },
  squad:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
}, { _id: false });

const configSchema = new mongoose.Schema({
  budget:      { type: Number, default: 10000, enum: [5000,7500,10000,15000,20000] },
  squadSize:   { type: Number, default: 15,    enum: [11,15,20,25] },
  timerSeconds:{ type: Number, default: 30,    enum: [10,20,30,60] },
  playerOrder: { type: String, default: 'category', enum: ['random','category'] },
  categories:  { type: [String], default: ['Batsman','Bowler','All-rounder','Wicketkeeper'] },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomCode:    { type: String, required: true, unique: true, uppercase: true, index: true },
  roomName:    { type: String, required: true, trim: true, maxlength: 40 },
  hostSession: { type: String, required: true },
  status:      { type: String, enum: ['lobby','auction','completed'], default: 'lobby' },
  maxParticipants: { type: Number, default: 20 },
  participants: [participantSchema],
  config:      { type: configSchema, default: () => ({}) },
  // Auction state embedded per room
  auction: {
    status:           { type: String, enum: ['idle','active','paused','round_break','completed'], default: 'idle' },
    currentRound:     { type: Number, default: 1 },
    maxRounds:        { type: Number, default: 3 },
    currentPlayer:    { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    currentHighestBid: { type: Number, default: 0 },
    currentHighestBidderSession: { type: String, default: null },
    currentHighestBidderName:    { type: String, default: null },
    currentHighestBidderColor:   { type: String, default: null },
    playerQueue:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    soldPlayers:   [{
      player:        { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
      soldToSession: String,
      soldToName:    String,
      soldToColor:   String,
      soldPrice:     Number,
      soldAt:        { type: Date, default: Date.now },
    }],
    unsoldPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    bidHistory:    [{
      playerName:    String,
      bidderSession: String,
      bidderName:    String,
      bidderColor:   String,
      amount:        Number,
      timestamp:     { type: Date, default: Date.now },
    }],
    results: {
      rankings: [{
        sessionId: String,
        teamName: String,
        color: String,
        score: Number,
        baseScore: Number,
        roleBalanceBonus: Number,
        totalSpent: Number,
        remainingBudget: Number,
        players: [{
          _id: mongoose.Schema.Types.ObjectId,
          name: String,
          role: String,
          image: String,
          soldPrice: Number,
          rating: Number,
        }],
      }],
      winner: {
        sessionId: String,
        teamName: String,
        score: Number,
      },
      runnerUp: {
        sessionId: String,
        teamName: String,
        score: Number,
      },
      thirdPlace: {
        sessionId: String,
        teamName: String,
        score: Number,
      },
      mostExpensivePlayer: {
        name: String,
        role: String,
        soldPrice: Number,
        soldToName: String,
      },
      insights: {
        steals: [{
          playerName: String,
          role: String,
          teamName: String,
          soldPrice: Number,
          basePrice: Number,
          marketValue: Number,
          valueDiff: Number,
        }],
        overpays: [{
          playerName: String,
          role: String,
          teamName: String,
          soldPrice: Number,
          basePrice: Number,
          marketValue: Number,
          valueDiff: Number,
        }],
      },
      generatedAt: Date,
    },
    timerStartedAt: { type: Date, default: null },
    timerEndsAt:    { type: Date, default: null },
  },
}, { timestamps: true });

// Auto-delete rooms after 24h of creation
roomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Room', roomSchema);
