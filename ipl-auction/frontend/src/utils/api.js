import api from '../services/api';

const toFormUrlEncoded = (data = {}) => {
  const params = new URLSearchParams();
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((item) => params.append(k, String(item)));
      return;
    }
    if (typeof v === 'object') {
      params.append(k, JSON.stringify(v));
      return;
    }
    params.append(k, String(v));
  });
  return params.toString();
};

export const roomsAPI = {
  // Some deployed backends may not parse JSON bodies reliably; form-encoding
  // keeps the request compatible with express.urlencoded middleware.
  create   : (d)    => api.post('/rooms/create', toFormUrlEncoded(d), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }),
  join     : (d)    => api.post('/rooms/join', toFormUrlEncoded(d), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }),
  get      : (code) => api.get(`/rooms/${code}`),
  setConfig: (code, d) =>
    api.put(`/rooms/${code}/config`, toFormUrlEncoded({ sessionId: d?.sessionId, config: d?.config }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  enableAI: (code, d) => api.post(`/rooms/${code}/enable-ai`, toFormUrlEncoded(d), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }),
};

export const auctionAPI = {
  getState: (code)    => api.get(`/rooms/${code}/auction`),
  start   : (code, d) => api.post(`/rooms/${code}/auction/start`,  d),
  pause   : (code, d) => api.post(`/rooms/${code}/auction/pause`,  d),
  resume  : (code, d) => api.post(`/rooms/${code}/auction/resume`, d),
  skip    : (code, d) => api.post(`/rooms/${code}/auction/skip`,   d),
  next    : (code, d) => api.post(`/rooms/${code}/auction/next`,   d),
  endRound: (code, d) => api.post(`/rooms/${code}/auction/end-round`, d),
  nextRound: (code, d) => api.post(`/rooms/${code}/auction/next-round`, d),
  bid     : (code, d) => api.post(`/rooms/${code}/auction/bid`,    d),
};

export const playersAPI = {
  getAll: (p) => api.get('/players', { params: p }),
  getOne: (id) => api.get(`/players/${id}`),
};

export const aiAPI = {
  suggestion: (roomCode, sessionId) => api.get(`/ai/suggestion/${roomCode}`, { params: { sessionId } }),
};

export const formatPrice = (v) => {
  if (v == null) return '—';
  if (v >= 100) return `₹${(v / 100).toFixed(v % 100 === 0 ? 0 : 1)} Cr`;
  return `₹${v}L`;
};

export const getIncrements = (cur) => {
  if (cur < 200)  return [10, 25, 50];
  if (cur < 500)  return [20, 50, 100];
  if (cur < 1000) return [50, 100, 200];
  if (cur < 2000) return [100, 200, 500];
  return [200, 500, 1000];
};

export default api;
