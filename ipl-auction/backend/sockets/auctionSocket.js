const Room = require('../models/Room');
const { safeRoom } = require('../routes/rooms');

module.exports = (io) => {
  io.on('connection', (socket) => {

    /* ── join a room's Socket.io channel ───────────────────────── */
    socket.on('join_room', async ({ roomCode, sessionId, teamName }) => {
      if (!roomCode) return;
      socket.join(roomCode);
      socket.roomCode  = roomCode;
      socket.sessionId = sessionId;

      // Also join a private channel for budget/squad updates
      if (sessionId) socket.join(`${roomCode}:${sessionId}`);

      try {
        // Mark participant online
        await Room.updateOne(
          { roomCode, 'participants.sessionId': sessionId },
          { $set: { 'participants.$.isOnline': true } }
        );
        const room = await Room.findOne({ roomCode })
          .populate('auction.currentPlayer')
          .populate('participants.squad')
          .populate('auction.soldPlayers.player')
          .populate('auction.unsoldPlayers');
        if (!room) return;

        // Broadcast updated participant list
        io.to(roomCode).emit('participants_updated', {
          participants: room.participants.map(p => ({
            teamName: p.teamName, color: p.color,
            isHost: p.isHost, isOnline: p.isOnline,
            sessionId: p.sessionId,
            budget: p.budget, remainingBudget: p.remainingBudget,
            squadSize: (p.squad||[]).length,
          })),
        });

        // Send current state to the joining socket
        let remainingTime = 0;
        if (room.auction.timerEndsAt && room.auction.status === 'active')
          remainingTime = Math.max(0, Math.floor((new Date(room.auction.timerEndsAt)-Date.now())/1000));

        socket.emit('room_state', {
          room: safeRoom(room),
          remainingTime,
        });
      } catch(e) { console.error('[join_room]', e.message); }
    });

    /* ── leave / disconnect ─────────────────────────────────────── */
    socket.on('leave_room', async ({ roomCode, sessionId }) => {
      socket.leave(roomCode);
      if (sessionId) socket.leave(`${roomCode}:${sessionId}`);
      await markOffline(io, roomCode, sessionId);
    });

    socket.on('disconnect', async () => {
      if (socket.roomCode && socket.sessionId)
        await markOffline(io, socket.roomCode, socket.sessionId);
    });

    /* ── host broadcasts announcement ───────────────────────────── */
    socket.on('host_announce', ({ roomCode, message }) => {
      io.to(roomCode).emit('announcement', { message });
    });
  });
};

async function markOffline(io, roomCode, sessionId) {
  try {
    await Room.updateOne(
      { roomCode, 'participants.sessionId': sessionId },
      { $set: { 'participants.$.isOnline': false } }
    );
    const room = await Room.findOne({ roomCode });
    if (!room) return;
    io.to(roomCode).emit('participants_updated', {
      participants: room.participants.map(p => ({
        teamName: p.teamName, color: p.color,
        isHost: p.isHost, isOnline: p.isOnline,
        sessionId: p.sessionId,
        budget: p.budget, remainingBudget: p.remainingBudget,
        squadSize: (p.squad||[]).length,
      })),
    });
  } catch(e) { /* ignore */ }
}
