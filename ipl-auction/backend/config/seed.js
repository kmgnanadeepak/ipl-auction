/**
 * Seed script — loads players from players.json into MongoDB.
 * Run: npm run seed
 */
const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const Player   = require('../models/Player');
const playerData = require('./players.json');

const samplePlayers = [
  { name: 'Virat Kohli', role: 'Batsman', country: 'India', basePrice: 200, status: 'available', soldPrice: null, iplTeam: 'Royal Challengers Bangalore', rating: 98, category: 'Marquee', stats: { runs: 7263, strikeRate: 130.5, average: 37.2 } },
  { name: 'Jasprit Bumrah', role: 'Bowler', country: 'India', basePrice: 200, status: 'available', soldPrice: null, iplTeam: 'Mumbai Indians', rating: 96, category: 'Marquee', stats: { wickets: 165, economy: 7.3, average: 22.4 } },
  { name: 'Ravindra Jadeja', role: 'All-rounder', country: 'India', basePrice: 180, status: 'available', soldPrice: null, iplTeam: 'Chennai Super Kings', rating: 94, category: 'Marquee', stats: { runs: 2800, strikeRate: 128.4, battingAverage: 27.4, wickets: 152, economy: 7.7, bowlingAverage: 30.1 } },
  { name: 'KL Rahul', role: 'Wicketkeeper', country: 'India', basePrice: 180, status: 'available', soldPrice: null, iplTeam: 'Lucknow Super Giants', rating: 91, category: 'Premium', stats: { runs: 4683, strikeRate: 134.2, average: 45.1 } },
  { name: 'Rashid Khan', role: 'Bowler', country: 'Afghanistan', basePrice: 180, status: 'available', soldPrice: null, iplTeam: 'Gujarat Titans', rating: 95, category: 'Marquee', stats: { wickets: 149, economy: 6.8, average: 20.6 } },
  { name: 'Shubman Gill', role: 'Batsman', country: 'India', basePrice: 150, status: 'available', soldPrice: null, iplTeam: 'Gujarat Titans', rating: 92, category: 'Premium', stats: { runs: 3221, strikeRate: 133.7, average: 37.9 } },
  { name: 'Andre Russell', role: 'All-rounder', country: 'West Indies', basePrice: 160, status: 'available', soldPrice: null, iplTeam: 'Kolkata Knight Riders', rating: 90, category: 'Premium', stats: { runs: 2326, strikeRate: 174.5, battingAverage: 29.4, wickets: 108, economy: 9.1, bowlingAverage: 25.8 } },
  { name: 'Rishabh Pant', role: 'Wicketkeeper', country: 'India', basePrice: 170, status: 'available', soldPrice: null, iplTeam: 'Delhi Capitals', rating: 89, category: 'Premium', stats: { runs: 3284, strikeRate: 147.8, average: 34.2 } },
  { name: 'Suryakumar Yadav', role: 'Batsman', country: 'India', basePrice: 170, status: 'available', soldPrice: null, iplTeam: 'Mumbai Indians', rating: 90, category: 'Premium', stats: { runs: 3562, strikeRate: 145.1, average: 32.8 } },
  { name: 'Bhuvneshwar Kumar', role: 'Bowler', country: 'India', basePrice: 120, status: 'available', soldPrice: null, iplTeam: 'Sunrisers Hyderabad', rating: 84, category: 'General', stats: { wickets: 170, economy: 7.4, average: 27.9 } },
];

async function seed() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('Missing required environment variable: MONGODB_URI');
    }
    console.log('Connecting to MongoDB for seed...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected (seed)');

    const sourcePlayers = Array.isArray(playerData) && playerData.length > 0 ? playerData : samplePlayers;
    // Validate required fields
    const valid = sourcePlayers.filter(p => p.name && p.role && p.country && p.basePrice != null);
    const invalid = sourcePlayers.length - valid.length;
    if (invalid) console.warn(`⚠️  Skipping ${invalid} players with missing required fields`);

    // Deduplicate by name
    const seen  = new Set();
    const dedup = valid.filter(p => {
      if (seen.has(p.name)) { console.warn(`  Duplicate skipped: ${p.name}`); return false; }
      seen.add(p.name); return true;
    });

    // Upsert each player
    let created = 0, updated = 0;
    for (const p of dedup) {
      const result = await Player.findOneAndUpdate(
        { name: p.name },
        {
          $set: {
            name:      p.name,
            country:   p.country   || 'India',
            role:      p.role,
            batting:   p.batting   || p.battingStyle || '',
            bowling:   p.bowling   || p.bowlingStyle || '',
            basePrice: Number(p.basePrice),
            rating:    Number(p.rating ?? 0),
            category:  p.category || 'General',
            iplTeam:   p.iplTeam || 'Did Not Play',
            isCapped:  Boolean(p.isCapped),
            isOverseas:Boolean(p.isOverseas),
            image:     p.image     || '',
            status:    p.status    || 'available',
            auctionOrder: Number(p.auctionOrder) || 0,
            stats: {
              matches:    Number(p.stats?.matches    ?? p.stats?.m    ?? 0),
              runs:       Number(p.stats?.runs       ?? p.stats?.r    ?? 0),
              average:    Number(p.stats?.average    ?? p.stats?.avg  ?? 0),
              strikeRate: Number(p.stats?.strikeRate ?? p.stats?.sr   ?? 0),
              wickets:    Number(p.stats?.wickets    ?? p.stats?.wkts ?? 0),
              economy:    Number(p.stats?.economy    ?? p.stats?.eco  ?? 0),
              battingAverage: Number(p.stats?.battingAverage ?? p.stats?.batAvg ?? p.stats?.average ?? p.stats?.avg ?? 0),
              bowlingAverage: Number(p.stats?.bowlingAverage ?? p.stats?.bowlAvg ?? 0),
              fifties:    Number(p.stats?.fifties    ?? p.stats?.['50s'] ?? 0),
              hundreds:   Number(p.stats?.hundreds   ?? p.stats?.['100s'] ?? 0),
            },
          },
        },
        { upsert: true, new: true }
      );
      if (result.__v === 0 || result.isNew) created++;
      else updated++;
    }

    console.log(`\n🏏 Players: ${created} created, ${updated} updated`);
    console.log(`📊 Total in DB: ${await Player.countDocuments()}`);
    process.exit(0);
  } catch (err) {
    console.error('MongoDB connection error (seed):', err);
    process.exit(1);
  }
}

seed();
