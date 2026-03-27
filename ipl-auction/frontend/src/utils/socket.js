import { io } from 'socket.io-client';

const URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;
let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(URL, { autoConnect: false, reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 10 });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  if (!s.__debugWired) {
    s.on('connect', () => console.log('[socket] connected', s.id));
    s.on('disconnect', (reason) => console.log('[socket] disconnected', reason));
    s.__debugWired = true;
  }
  if (!s.connected) s.connect();
  return s;
};

export const joinRoom = (roomCode, sessionId, teamName) => {
  const s = connectSocket();
  const doJoin = () => {
    console.log('[socket] join_room emit', { roomCode, sessionId, teamName });
    s.emit('join_room', { roomCode, sessionId, teamName });
  };
  if (s.connected) doJoin();
  else s.once('connect', doJoin);
  return s;
};

export const leaveRoom = (roomCode, sessionId) => {
  const s = getSocket();
  if (s.connected) s.emit('leave_room', { roomCode, sessionId });
  s.off();
};

export default getSocket;
