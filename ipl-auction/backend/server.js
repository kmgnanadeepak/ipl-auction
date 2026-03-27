const express   = require('express');
const http      = require('http');
const socketIO  = require('socket.io');
const mongoose  = require('mongoose');
const cors      = require('cors');
const dotenv    = require('dotenv');

dotenv.config();

const app    = express();
const server = http.createServer(app);
const corsAllowedOrigins = [
  'http://localhost:5173',
  'https://ipl-auction-wine.vercel.app',
  'https://auctionx.idk158.me',
];
const io     = socketIO(server, {
  cors: {
    origin: corsAllowedOrigins,
    methods: ['GET','POST','PUT','DELETE'],
    credentials:true
  }
});

app.use(cors({
  origin: corsAllowedOrigins,
  credentials:true,
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','x-session-id'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended:true }));

app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/players',                require('./routes/players'));
app.use('/api/rooms',                  require('./routes/rooms'));
app.use('/api/rooms/:roomCode/auction',require('./routes/roomAuction'));
app.use('/api/ai',                     require('./routes/ai'));

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

// Connectivity test route (used for deployment debugging)
app.get('/api/test', (_, res) => {
  res.status(200).json({ message: 'API working', timestamp: new Date() });
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

// Optionally refresh IPL teams from live squads source on startup.
// This runs best-effort and never blocks the server from starting if it fails.
async function refreshIplTeamsOnStartup() {
  try {
    const { refreshAllPlayersIPLTeams } = require('./services/iplTeamsService');
    await refreshAllPlayersIPLTeams();
  } catch (e) {
    console.error('IPL teams refresh error:', e.message);
  }
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
    // Fire-and-forget: do not block the server start if this is slow
    refreshIplTeamsOnStartup();
    server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io, startServer };
