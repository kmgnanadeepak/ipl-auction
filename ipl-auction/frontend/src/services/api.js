import axios from 'axios';
import { API } from './env';

const api = axios.create({
  baseURL: `${API}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((cfg) => {
  const sid = localStorage.getItem('sessionId');
  if (sid) cfg.headers['x-session-id'] = sid;
  return cfg;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const method = error?.config?.method?.toUpperCase() || 'UNKNOWN';
    const url = error?.config?.url || 'unknown-url';
    const status = error?.response?.status || 'NO_STATUS';
    console.error(`[API ERROR] ${method} ${url} -> ${status}`, error?.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
