const sanitize = (url) => String(url || '').replace(/\/+$/, '');

export const API = sanitize(import.meta.env.VITE_API_URL || 'http://localhost:5000');

console.log('API:', import.meta.env.VITE_API_URL);
