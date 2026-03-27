const Player = require('../models/Player');
const fs = require('fs');
const path = require('path');

// In-memory cache so we don't re-read JSON too often
let cachedMap = null;
let cachedAt = 0;
let cachedSquads = null;
let cachedSquadsAt = 0;

// Default TTL: 24 hours (in ms)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

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

function playersJsonPath() {
  return path.join(__dirname, '..', 'config', 'players.json');
}

function readPlayersJson() {
  const raw = fs.readFileSync(playersJsonPath(), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function resolveTeamField(p) {
  // Requirement says "team" field; fall back to existing schema field `iplTeam`.
  return p?.team || p?.iplTeam || 'Did Not Play';
}

function shouldFilterToAuctionOutcome(players) {
  // If the dataset has any "sold" markers, return only those.
  return (players || []).some((p) =>
    p?.status === 'sold' || p?.soldPrice != null || p?.soldTo != null
  );
}

async function getPlayerTeamMap({ forceRefresh = false } = {}) {
  const ttlMs = Number(process.env.IPL_SQUADS_TTL_MS || DEFAULT_TTL_MS);
  const now = Date.now();

  if (!forceRefresh && cachedMap && now - cachedAt < ttlMs) {
    return cachedMap;
  }

  const players = readPlayersJson();
  const onlyOutcome = shouldFilterToAuctionOutcome(players);
  const map = {};
  (onlyOutcome ? players.filter(p => p?.status === 'sold' || p?.soldPrice != null || p?.soldTo != null) : players)
    .forEach((p) => {
      const n = normalizeName(p?.name);
      if (!n) return;
      map[n] = resolveTeamField(p);
    });

  cachedMap = map;
  cachedAt = now;
  return map;
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
    const existingTeam = resolveTeamField(doc) && resolveTeamField(doc) !== 'Did Not Play' ? resolveTeamField(doc) : null;

    const normalized = normalizeName(doc.name);
    const liveTeam = fuzzyFindTeam(normalized, map);

    return {
      ...doc,
      iplTeam: liveTeam || existingTeam || 'Did Not Play',
    };
  });
}

/**
 * Return team squads derived purely from local `players.json`,
 * grouped by the player's "team" field (or `iplTeam` fallback).
 *
 * If auction outcome markers exist, only includes sold/outcome players.
 */
async function getTeamSquads({ forceRefresh = false } = {}) {
  const ttlMs = Number(process.env.IPL_SQUADS_TTL_MS || DEFAULT_TTL_MS);
  const now = Date.now();
  if (!forceRefresh && cachedSquads && now - cachedSquadsAt < ttlMs) return cachedSquads;

  const players = readPlayersJson();
  const onlyOutcome = shouldFilterToAuctionOutcome(players);
  const list = onlyOutcome
    ? players.filter(p => p?.status === 'sold' || p?.soldPrice != null || p?.soldTo != null)
    : players;

  const squads = {};
  list.forEach((p) => {
    const team = resolveTeamField(p);
    if (!team) return;
    if (!squads[team]) squads[team] = [];
    squads[team].push(p);
  });

  // Stable ordering inside squads: soldPrice desc (if present), else basePrice desc, else name asc
  Object.keys(squads).forEach((t) => {
    squads[t].sort((a, b) =>
      (Number(b?.soldPrice || 0) - Number(a?.soldPrice || 0)) ||
      (Number(b?.basePrice || 0) - Number(a?.basePrice || 0)) ||
      String(a?.name || '').localeCompare(String(b?.name || ''))
    );
  });

  cachedSquads = squads;
  cachedSquadsAt = now;
  return squads;
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
      }
    }
  } catch (err) {
    // Intentionally silent: this service must not depend on external APIs.
  }
}

module.exports = {
  getPlayerTeamMap,
  attachLiveTeamsToPlayers,
  refreshAllPlayersIPLTeams,
  getTeamSquads,
};

