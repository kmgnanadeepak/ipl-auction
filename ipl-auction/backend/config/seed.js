/**
 * Seed script — loads players from players.json into MongoDB.
 * Run: npm run seed
 */
const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const Player   = require('../models/Player');
const playerData = require('./players.json');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl_auction');
    console.log('✅ Connected to MongoDB');

    // Validate required fields
    const valid = playerData.filter(p => p.name && p.role && p.country && p.basePrice != null);
    const invalid = playerData.length - valid.length;
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
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seed();
