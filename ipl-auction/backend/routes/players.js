const express = require('express');
const router  = express.Router();
const {
  getPlayers,
  getPlayersWithLiveTeams,
  getPlayer,
  createPlayer,
  updatePlayer,
  deletePlayer,
} = require('../controllers/playerController');

// Basic players list (uses stored iplTeam)
router.get('/', getPlayers);

// Enriched list with live IPL 2026 team mapping (non-persistent)
router.get('/with-live-teams', getPlayersWithLiveTeams);

router.get('/:id', getPlayer);
// Admin-only operations – no auth in guest mode, protect via ADMIN_KEY header
router.post('/',       createPlayer);
router.put('/:id',     updatePlayer);
router.delete('/:id',  deletePlayer);

module.exports = router;
