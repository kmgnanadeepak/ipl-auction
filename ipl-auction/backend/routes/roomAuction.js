const express = require('express');
const router  = express.Router({ mergeParams: true });
const ctrl    = require('../controllers/roomAuctionController');

// GET  /api/rooms/:roomCode/auction
router.get('/',         ctrl.getRoom);
// POST /api/rooms/:roomCode/auction/start
router.post('/start',   ctrl.startAuction);
router.post('/pause',   ctrl.pauseAuction);
router.post('/resume',  ctrl.resumeAuction);
router.post('/skip',    ctrl.skipPlayer);
router.post('/next',    ctrl.nextPlayer);
router.post('/end-round', ctrl.endRound);
router.post('/next-round', ctrl.startNextRound);
router.post('/bid',     ctrl.placeBid);

module.exports = router;
