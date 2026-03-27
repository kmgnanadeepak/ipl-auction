const express = require('express');
const router = express.Router();
const {
  getAuctionState, startAuction, pauseAuction, resumeAuction,
  nextPlayer, skipPlayer, stopAuction, resetAuction,
  markSold, markUnsold
} = require('../controllers/auctionController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/state', protect, getAuctionState);
router.post('/start', protect, adminOnly, startAuction);
router.post('/pause', protect, adminOnly, pauseAuction);
router.post('/resume', protect, adminOnly, resumeAuction);
router.post('/next', protect, adminOnly, nextPlayer);
router.post('/skip', protect, adminOnly, skipPlayer);
router.post('/stop', protect, adminOnly, stopAuction);
router.post('/reset', protect, adminOnly, resetAuction);
router.post('/sold', protect, adminOnly, markSold);
router.post('/unsold', protect, adminOnly, markUnsold);

module.exports = router;
