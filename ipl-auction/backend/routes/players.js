const express = require('express');
const router  = express.Router();
const { getPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer } = require('../controllers/playerController');

router.get('/',    getPlayers);
router.get('/:id', getPlayer);
// Admin-only operations – no auth in guest mode, protect via ADMIN_KEY header
router.post('/',       createPlayer);
router.put('/:id',     updatePlayer);
router.delete('/:id',  deletePlayer);

module.exports = router;
