const express = require('express');
const router = express.Router({ mergeParams: true });
const { getRoomSuggestion } = require('../controllers/aiController');

router.get('/suggestion/:roomCode', getRoomSuggestion);

module.exports = router;
