const express   = require('express');
const http      = require('http');
const socketIO  = require('socket.io');
const mongoose  = require('mongoose');
const cors      = require('cors');
const dotenv    = require('dotenv');

dotenv.config();

// Ensure mongoose models are registered before any route/controller uses them
require('./models/User');

const app    = express();
const server = http.createServer(app);
const corsAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://ipl-auction-wine.vercel.app',
  'https://auctionx.idk158.me',
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

// If you need to temporarily allow ANY origin for testing:
// set CORS_ALLOW_ALL=true (it will reflect the request Origin).
const allowAllOrigins = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true';

const corsOptions = {
  origin(origin, cb) {
    // Non-browser clients (no Origin header) should be allowed.
    if (!origin) return cb(null, true);
    if (allowAllOrigins) return cb(null, true);
    if (corsAllowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  optionsSuccessStatus: 204,
};
const io     = socketIO(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowAllOrigins) return cb(null, true);
      return cb(null, corsAllowedOrigins.includes(origin));
    },
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    credentials:true
  }
});

app.use(cors(corsOptions));
// Ensure preflight requests are handled for every route
app.options('*', cors(corsOptions));
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

const DEFAULT_PORT = 5000;
const BASE_PORT = Number(process.env.PORT) || DEFAULT_PORT;
const MAX_PORT_TRIES = 25;

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
    const listenWithRetry = (port, triesLeft) => {
      const onListening = () => {
        server.off('error', onError);
        console.log(`🚀 Server on port ${port}`);
      };
      const onError = (err) => {
        server.off('listening', onListening);
        if (err?.code === 'EADDRINUSE' && triesLeft > 0) {
          console.log(`Port ${port} is in use, trying another port...`);
          setTimeout(() => listenWithRetry(port + 1, triesLeft - 1), 250);
          return;
        }
        console.error('Server failed to start:', err);
        process.exit(1);
      };

      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(port);
    };

    listenWithRetry(BASE_PORT, MAX_PORT_TRIES);
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io, startServer };
