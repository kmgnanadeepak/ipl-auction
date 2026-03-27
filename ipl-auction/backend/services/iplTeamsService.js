const Player = require('../models/Player');
const fetch = require('node-fetch');

// In-memory cache so we don't hammer the external API
let cachedMap = null;
let cachedAt = 0;

// Default TTL: 24 hours (in ms)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeName = (name = '') =>
  String(name)
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

function fuzzyFindTeam(normalizedName, map) {
  if (!normalizedName || !map) return null;

  // Exact match first
  if (map[normalizedName]) return map[normalizedName];

  // Contains / starts-with match as a fallback (simple fuzzy)
  const entries = Object.entries(map);
  for (const [key, team] of entries) {
    if (key === normalizedName) return team;
    if (key.startsWith(normalizedName)) return team;
    if (normalizedName.startsWith(key)) return team;
  }

  return null;
}

async function fetchRawSquadsFromApi() {
  const endpoint =
    process.env.IPL_SQUADS_URL ||
    // Placeholder – user should point this to RapidAPI / CricBuzz / ESPN
    'https://example.com/ipl-2026-squads';

  const headers = {};

  if (process.env.RAPIDAPI_IPL_HOST) {
    headers['x-rapidapi-host'] = process.env.RAPIDAPI_IPL_HOST;
  }
  if (process.env.RAPIDAPI_IPL_KEY) {
    headers['x-rapidapi-key'] = process.env.RAPIDAPI_IPL_KEY;
  }

  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    throw new Error(`IPL squads fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Transform the external API response into a flat
 * { normalizedPlayerName: teamCodeOrName } map.
 *
 * This is intentionally generic – adapt the parsing to your chosen API
 * structure (RapidAPI Cricbuzz / ESPN, etc.).
 */
function buildPlayerTeamMapFromApiResponse(raw) {
  const map = {};

  if (!raw) return map;

  // Very generic handling:
  // Expecting something like: [{ teamName, shortName, players: [{ name }, ...] }, ...]
  const teams = Array.isArray(raw.teams || raw.squads || raw) ? (raw.teams || raw.squads || raw) : [];

  teams.forEach((team) => {
    const teamCode = team.shortName || team.abbreviation || team.code || team.teamName || team.name;
    const players = Array.isArray(team.players || team.squad || team.members) ? (team.players || team.squad || team.members) : [];
    if (!teamCode || !players.length) return;

    players.forEach((p) => {
      const n = normalizeName(p.name || p.fullName || p.playerName);
      if (!n) return;
      map[n] = teamCode;
    });
  });

  return map;
}

async function getPlayerTeamMap({ forceRefresh = false } = {}) {
  const ttlMs = Number(process.env.IPL_SQUADS_TTL_MS || DEFAULT_TTL_MS);
  const now = Date.now();

  if (!forceRefresh && cachedMap && now - cachedAt < ttlMs) {
    return cachedMap;
  }

  try {
    const raw = await fetchRawSquadsFromApi();
    const map = buildPlayerTeamMapFromApiResponse(raw);
    cachedMap = map;
    cachedAt = now;
    return map;
  } catch (err) {
    console.error('[iplTeamsService] Failed to refresh squads:', err.message);
    // Never throw to callers – they can still fall back to DB values / DNP
    if (cachedMap) return cachedMap;
    return {};
  }
}

/**
 * Enrich a list of Player mongoose documents or plain objects
 * with a resolved `iplTeam` field based on live IPL squads.
 * This is read-only and does not persist to MongoDB.
 */
async function attachLiveTeamsToPlayers(players) {
  if (!Array.isArray(players) || players.length === 0) return players || [];

  const map = await getPlayerTeamMap();

  return players.map((p) => {
    if (!p) return p;
    const doc = p.toObject ? p.toObject() : { ...p };
    const existingTeam = doc.iplTeam && doc.iplTeam !== 'Did Not Play' ? doc.iplTeam : null;

    const normalized = normalizeName(doc.name);
    const liveTeam = fuzzyFindTeam(normalized, map);

    return {
      ...doc,
      iplTeam: liveTeam || existingTeam || 'Did Not Play',
    };
  });
}

/**
 * Optional helper to sync live IPL teams into MongoDB Player documents.
 * This can be run on startup or via an admin endpoint.
 */
async function refreshAllPlayersIPLTeams() {
  try {
    const map = await getPlayerTeamMap({ forceRefresh: true });
    const players = await Player.find({}).select({ name: 1, iplTeam: 1 });

    if (!players.length || !Object.keys(map).length) return;

    for (const pl of players) {
      const normalized = normalizeName(pl.name);
      const liveTeam = fuzzyFindTeam(normalized, map);
      if (!liveTeam) continue;

      // Only overwrite if different, to avoid unnecessary writes
      if (pl.iplTeam !== liveTeam) {
        pl.iplTeam = liveTeam;
        await pl.save();
        // Small delay to be nice to MongoDB in tiny deployments
        await sleep(5);
      }
    }

    console.log('[iplTeamsService] Refreshed IPL teams for', players.length, 'players');
  } catch (err) {
    console.error('[iplTeamsService] Failed to refresh all players:', err.message);
  }
}

module.exports = {
  getPlayerTeamMap,
  attachLiveTeamsToPlayers,
  refreshAllPlayersIPLTeams,
};

