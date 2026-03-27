const sanitize = (url) => String(url || '').replace(/\/+$/, '');

const fromEnv = sanitize(import.meta.env.VITE_API_URL);

// Fallback only kicks in when Vercel/production doesn't have VITE_API_URL set.
// This keeps the app from silently calling localhost in production.
const fallbackProd = 'https://ipl-auction-4c51.onrender.com';
const fallbackDev  = 'http://localhost:5000';

export const API = sanitize(fromEnv || (import.meta.env.DEV ? fallbackDev : fallbackProd));

if (!fromEnv) {
  console.warn(
    `[env] VITE_API_URL not set. Using ${import.meta.env.DEV ? 'dev' : 'prod'} fallback: ${API}`
  );
}
