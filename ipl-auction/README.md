# 🏏 IPL Auction Platform — Room-Based Guest Mode

A real-time multi-room IPL auction platform. No login required. Create a private room, share the code, configure settings, and bid live.

---

## 🚀 Quick Start

### 1. Install
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit backend/.env with your MongoDB URI
```

### 3. Seed Players (311 IPL players from players.json)
```bash
cd backend && npm run seed
```

### 4. Run
```bash
# Terminal 1 — backend (auto-seeds on first start if DB is empty)
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm start
```
- Frontend: http://localhost:3000
- Backend:  http://localhost:5000/api/health

---

## 🎮 How It Works

### Guest Flow (no login needed)
1. Visit the homepage
2. Click **Create Room** → enter Room Name + Your Team Name → get a 6-digit Room Code
3. Share the Room Code with friends
4. Friends click **Join Room** → enter code + their team name
5. Host configures settings in the Lobby
6. Host clicks **Start Auction** → everyone is redirected to the live auction
7. Bid in real-time with Socket.io

### Session Persistence
- Each browser gets a UUID stored in `localStorage` as `sessionId`
- This survives page refreshes and allows reconnection
- Room code + team name also stored in `localStorage` for auto-rejoin

---

## 🏠 Lobby Page (Single Unified Page)

After creating/joining a room, everyone lands on **one page** that contains:

| Section | Description |
|---|---|
| **Room Details** | Room name, 6-char Room Code with copy button |
| **Participants List** | Live list (Socket.io), online/offline status, max 20 teams |
| **Auction Config** | Budget, Squad Size, Timer, Player Order, Category Filter |
| **Host Controls** | Start button (host only); others see read-only view |

---

## ⚙️ Auction Configuration Options

| Setting | Options |
|---|---|
| Budget | ₹50 Cr / ₹75 Cr / ₹100 Cr / ₹150 Cr / ₹200 Cr |
| Squad Size | 11 / 15 / 20 / 25 players |
| Timer | 10s / 20s / 30s / 60s per player |
| Player Order | Category-wise (BAT→WK→AR→BOWL) or Random |
| Categories | Toggle: Batsman / Bowler / All-rounder / Wicketkeeper |

---

## 📡 Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `join_room` | C→S | Join a room's socket channel |
| `leave_room` | C→S | Leave room |
| `room_state` | S→C | Full room state on connect |
| `participants_updated` | S→C | Live participant list update |
| `config_updated` | S→C | Host changed config |
| `auction_started` | S→C | Auction kicked off |
| `timer_update` | S→C | Countdown tick (every second) |
| `new_bid` | S→C | New highest bid placed |
| `player_sold` | S→C | Player sold to highest bidder |
| `player_unsold` | S→C | Player went unsold |
| `next_player` | S→C | Next player up for auction |
| `auction_paused/resumed` | S→C | Host paused/resumed |
| `auction_completed` | S→C | All players auctioned |
| `budget_update` | S→C (private) | Winner's budget updated |

---

## 🗃️ Player Data

- **311 real IPL-style players** stored in `backend/config/players.json`
- Seeded automatically on first backend start (if DB is empty)
- Or run `npm run seed` manually
- Each player has: name, role, country, basePrice, batting/bowling style, isCapped, isOverseas, stats (matches/runs/avg/sr/wickets/economy), image placeholder

---

## 🌐 Deployment

### Frontend → Vercel
```bash
cd frontend && npm run build
# Push to GitHub, connect to Vercel
# Set env vars:
# REACT_APP_API_URL=https://your-backend.onrender.com/api
# REACT_APP_SOCKET_URL=https://your-backend.onrender.com
```
Add `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

### Backend → Render.com
- Build: `npm install`
- Start: `node server.js`
- Env vars: `MONGODB_URI`, `FRONTEND_URL`, `NODE_ENV=production`

### Database → MongoDB Atlas
```
mongodb+srv://user:pass@cluster.mongodb.net/ipl_auction?retryWrites=true&w=majority
```
