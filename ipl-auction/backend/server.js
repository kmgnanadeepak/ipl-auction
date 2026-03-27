const express   = require('express');
const http      = require('http');
const socketIO  = require('socket.io');
const mongoose  = require('mongoose');
const cors      = require('cors');
const dotenv    = require('dotenv');

dotenv.config();

const app    = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowVercelPreviews) {
    try {
      if (/\.vercel\.app$/i.test(new URL(origin).hostname)) return true;
    } catch (_) {}
  }
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
};
const io     = socketIO(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods:['GET','POST'],
    credentials:true
  }
});

app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials:true
}));
app.use(express.json());
app.use(express.urlencoded({ extended:true }));

app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/players',                require('./routes/players'));
app.use('/api/rooms',                  require('./routes/rooms'));
app.use('/api/rooms/:roomCode/auction',require('./routes/roomAuction'));

// Health check
app.get('/api/health', (_, res) => {
  const readyState = mongoose.connection.readyState;
  const dbStateByCode = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const dbState = dbStateByCode[readyState] || 'unknown';
  const ok = readyState === 1;
  return res.status(ok ? 200 : 503).json({
    status: ok ? 'OK' : 'DEGRADED',
    db: dbState,
    timestamp: new Date(),
  });
});

// ── Sockets ───────────────────────────────────────────────────────────
require('./sockets/auctionSocket')(io);

// ── Seed players on first run ─────────────────────────────────────────
async function seedPlayersIfEmpty() {
  try {
    const Player = require('./models/Player');
    const count  = await Player.countDocuments();
    if (count === 0) {
      console.log('🌱 No players found – seeding from players.json …');
      const data = require('./config/players.json');
      await Player.insertMany(data, { ordered:false });
      console.log(`✅ Seeded ${data.length} players`);
    }
  } catch(e) { console.error('Seed error:', e.message); }
}

const PORT = process.env.PORT || 5000;

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing required environment variable: MONGODB_URI');
  }
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('MongoDB connected');
}

async function startServer() {
  try {
    await connectDatabase();
    await seedPlayersIfEmpty();
    server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io, startServer };
