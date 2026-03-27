import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '/api';
const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use(cfg => {
  const sid = localStorage.getItem('sessionId');
  if (sid) cfg.headers['x-session-id'] = sid;
  return cfg;
});

export const roomsAPI = {
  create   : (d)    => api.post('/rooms/create', d),
  join     : (d)    => api.post('/rooms/join',   d),
  get      : (code) => api.get(`/rooms/${code}`),
  setConfig: (code, d) => api.put(`/rooms/${code}/config`, d),
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
