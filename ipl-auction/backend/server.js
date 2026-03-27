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
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
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

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl_auction')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/players',                require('./routes/players'));
app.use('/api/rooms',                  require('./routes/rooms'));
app.use('/api/rooms/:roomCode/auction',require('./routes/roomAuction'));

// Health check
app.get('/api/health', (_,res) => res.json({ status:'OK', timestamp: new Date() }));

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
mongoose.connection.once('open', seedPlayersIfEmpty);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
module.exports = { app, io };
