const DAY_MS = 24 * 60 * 60 * 1000;

const cache = {
  expiresAt: 0,
  teamByPlayer: new Map(),
  source: null,
};

const DEFAULT_ESPN_TEAMS_URL =
  process.env.ESPN_IPL_TEAMS_URL ||
  'https://site.api.espncricinfo.com/apis/site/v2/sports/cricket/teams?region=in&limit=200';

const PROVIDER = (process.env.LIVE_IPL_PROVIDER || 'espn').toLowerCase();

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameVariants(name) {
  const base = normalizeName(name);
  if (!base) return [];
  const parts = base.split(' ').filter(Boolean);
  const variants = new Set([base]);
  if (parts.length > 1) {
    variants.add(`${parts[0]} ${parts[parts.length - 1]}`);
    variants.add(parts[parts.length - 1]);
  }
  return [...variants];
}

function isIplTeamName(name) {
  const n = normalizeName(name);
  return (
    n.includes('indians') ||
    n.includes('super kings') ||
    n.includes('royal challengers') ||
    n.includes('knight riders') ||
    n.includes('sunrisers') ||
    n.includes('titans') ||
    n.includes('capitals') ||
    n.includes('kings') ||
    n.includes('rajasthan royals') ||
    n.includes('lucknow super giants')
  );
}

function extractAthleteNames(value, out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((v) => extractAthleteNames(v, out));
    return out;
  }
  if (typeof value !== 'object') return out;

  const candidate =
    value.fullName ||
    value.displayName ||
    value.longName ||
    value.shortName ||
    value.name;
  if (typeof candidate === 'string' && candidate.trim()) {
    out.push(candidate.trim());
  }

  const keys = Object.keys(value);
  keys.forEach((k) => {
    if (
      ['players', 'player', 'athletes', 'athlete', 'squad', 'members', 'items', 'content'].includes(
        k.toLowerCase()
      )
    ) {
      extractAthleteNames(value[k], out);
    }
  });
  return out;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Upstream error (${res.status}) for ${url}`);
  }
  return res.json();
}

function upsertTeamMap(teamByPlayer, teamName, playerNames = []) {
  if (!teamName || !playerNames.length) return;
  playerNames.forEach((p) => {
    nameVariants(p).forEach((variant) => {
      teamByPlayer.set(variant, teamName);
    });
  });
}

async function fetchFromEspn() {
  const data = await fetchJson(DEFAULT_ESPN_TEAMS_URL);
  const teamEntries = [];
  const leagues = (((data || {}).sports || [])[0] || {}).leagues || [];
  leagues.forEach((league) => {
    (league.teams || []).forEach((teamWrap) => {
      const teamObj = teamWrap.team || teamWrap;
      const teamName =
        teamObj.displayName || teamObj.shortDisplayName || teamObj.name || teamObj.abbreviation;
      if (!teamName || !isIplTeamName(teamName)) return;
      teamEntries.push({
        id: teamObj.id,
        uid: teamObj.uid,
        teamName,
        rosterUrl:
          (teamObj.links || []).find((l) => String(l.rel || '').toLowerCase().includes('roster'))?.href || null,
        inlineAthletes: teamObj.athletes || teamObj.players || [],
      });
    });
  });

  if (!teamEntries.length) {
    throw new Error('No IPL teams found in ESPN response');
  }

  const teamByPlayer = new Map();
  for (const team of teamEntries) {
    let names = extractAthleteNames(team.inlineAthletes, []);
    if ((!names || names.length === 0) && team.rosterUrl) {
      try {
        const rosterData = await fetchJson(team.rosterUrl);
        names = extractAthleteNames(rosterData, []);
      } catch (_) {
        // ignore one-team roster failures
      }
    }
    upsertTeamMap(teamByPlayer, team.teamName, names);
  }

  return { teamByPlayer, source: 'espn' };
}

async function fetchFromRapidApi() {
  const url = process.env.RAPIDAPI_IPL_SQUADS_URL;
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.RAPIDAPI_HOST;
  if (!url || !key || !host) {
    throw new Error('RapidAPI config missing: RAPIDAPI_IPL_SQUADS_URL, RAPIDAPI_KEY, RAPIDAPI_HOST');
  }

  const data = await fetchJson(url, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': host,
    },
  });

  const teams = data.teams || data.team || data.squads || [];
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('RapidAPI response has no teams');
  }

  const teamByPlayer = new Map();
  teams.forEach((t) => {
    const teamName = t.name || t.teamName || t.shortName;
    const names = extractAthleteNames(t.players || t.squad || t.members || []);
    if (isIplTeamName(teamName)) upsertTeamMap(teamByPlayer, teamName, names);
  });

  return { teamByPlayer, source: 'rapidapi' };
}

async function refreshTeamCache(force = false) {
  if (!force && Date.now() < cache.expiresAt && cache.teamByPlayer.size > 0) {
    return cache;
  }

  let result;
  if (PROVIDER === 'rapidapi') result = await fetchFromRapidApi();
  else result = await fetchFromEspn();

  cache.teamByPlayer = result.teamByPlayer;
  cache.source = result.source;
  cache.expiresAt = Date.now() + DAY_MS;
  return cache;
}

function getTeamFromMap(playerName, teamByPlayer) {
  const variants = nameVariants(playerName);
  for (const v of variants) {
    if (teamByPlayer.has(v)) return teamByPlayer.get(v);
  }
  return null;
}

async function mapPlayersWithLiveTeams(players, options = {}) {
  try {
    const teamCache = await refreshTeamCache(Boolean(options.forceRefresh));
    return {
      source: teamCache.source,
      players: players.map((p) => {
        const obj = p.toObject ? p.toObject() : p;
        const mapped = getTeamFromMap(obj.name, teamCache.teamByPlayer);
        const liveIplTeam = mapped || (obj.iplTeam && obj.iplTeam !== 'Did Not Play' ? obj.iplTeam : 'DNP');
        return { ...obj, liveIplTeam, iplTeam: liveIplTeam };
      }),
    };
  } catch (err) {
    // Upstream fail: keep existing data and fallback to DNP only when empty.
    return {
      source: 'fallback',
      error: err.message,
      players: players.map((p) => {
        const obj = p.toObject ? p.toObject() : p;
        const liveIplTeam = obj.iplTeam && obj.iplTeam !== 'Did Not Play' ? obj.iplTeam : 'DNP';
        return { ...obj, liveIplTeam, iplTeam: liveIplTeam };
      }),
    };
  }
}

module.exports = {
  mapPlayersWithLiveTeams,
  refreshTeamCache,
};
