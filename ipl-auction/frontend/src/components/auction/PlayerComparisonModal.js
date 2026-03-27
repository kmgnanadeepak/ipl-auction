import React, { useMemo } from 'react';
import { formatPrice } from '../../utils/api';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readStat(player, keys) {
  const s = player?.stats || {};
  for (const k of keys) {
    const v = s?.[k];
    const n = num(v);
    if (n != null) return n;
  }
  return null;
}

function readText(player, keys) {
  for (const k of keys) {
    const v = player?.[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}

function roleShort(role) {
  if (role === 'Batsman') return 'BAT';
  if (role === 'Bowler') return 'BOWL';
  if (role === 'All-rounder') return 'AR';
  if (role === 'Wicketkeeper') return 'WK';
  return role || '—';
}

function buildRows(a, b) {
  const aRole = readText(a, ['role']);
  const bRole = readText(b, ['role']);
  const isBowlerish = (r) => r === 'Bowler' || r === 'All-rounder';
  const isBatterish = (r) => r === 'Batsman' || r === 'All-rounder' || r === 'Wicketkeeper';
  const includeBatting = isBatterish(aRole) || isBatterish(bRole);
  const includeBowling = isBowlerish(aRole) || isBowlerish(bRole);

  const rows = [
    {
      key: 'role',
      label: 'Role',
      type: 'text',
      get: (p) => roleShort(readText(p, ['role'])),
    },
    {
      key: 'team',
      label: 'Team',
      type: 'text',
      get: (p) => readText(p, ['iplTeam']) || 'Did Not Play',
    },
    {
      key: 'country',
      label: 'Country',
      type: 'text',
      get: (p) => readText(p, ['country']),
    },
    {
      key: 'matches',
      label: 'Matches Played',
      type: 'number',
      better: 'higher',
      get: (p) => readStat(p, ['matches']),
    },
    {
      key: 'basePrice',
      label: 'Base Price',
      type: 'price',
      get: (p) => num(p?.basePrice),
    },
    {
      key: 'soldPrice',
      label: 'Auction Price',
      type: 'price',
      get: (p) => num(p?.soldPrice),
      emptyLabel: 'Not sold',
    },
  ];

  const battingRows = [
    { key: 'runs', label: 'Runs', get: (p) => readStat(p, ['runs']), better: 'higher' },
    { key: 'strikeRate', label: 'Strike Rate', get: (p) => readStat(p, ['strikeRate', 'sr']), better: 'higher' },
    { key: 'average', label: 'Average', get: (p) => readStat(p, ['average', 'avg']), better: 'higher' },
    { key: 'fifties', label: '50s', get: (p) => readStat(p, ['fifties', '50s']), better: 'higher' },
    { key: 'hundreds', label: '100s', get: (p) => readStat(p, ['hundreds', '100s']), better: 'higher' },
    { key: 'battingAverage', label: 'Batting Avg', get: (p) => readStat(p, ['battingAverage']), better: 'higher' },
  ];

  const bowlingRows = [
    { key: 'wickets', label: 'Wickets', get: (p) => readStat(p, ['wickets', 'wkts']), better: 'higher' },
    { key: 'economy', label: 'Economy', get: (p) => readStat(p, ['economy', 'eco']), better: 'lower' },
    { key: 'bowlingAverage', label: 'Bowling Avg', get: (p) => readStat(p, ['bowlingAverage']), better: 'lower' },
  ];

  if (includeBatting) rows.push(...battingRows);
  if (includeBowling) rows.push(...bowlingRows);

  // Only keep rows that exist for at least one player
  const filtered = rows.filter((r) => {
    const av = r.get(a);
    const bv = r.get(b);
    const hasA = av != null && av !== '' && av !== '—';
    const hasB = bv != null && bv !== '' && bv !== '—';
    return hasA || hasB;
  });

  return filtered.map((r) => {
    const av = r.get(a);
    const bv = r.get(b);
    let better = null;
    if (r.type === 'number' || r.better) {
      const an = num(av);
      const bn = num(bv);
      if (an != null && bn != null && an !== bn) {
        if ((r.better || 'higher') === 'lower') better = an < bn ? 'a' : 'b';
        else better = an > bn ? 'a' : 'b';
      }
    }
    return { ...r, aVal: av, bVal: bv, better };
  });
}

function renderValue(row, v) {
  if (v == null || v === '') return row.emptyLabel || '—';
  if (row.type === 'price') return formatPrice(v);
  return String(v);
}

export default function PlayerComparisonModal({ open, onClose, leftPlayer, rightPlayer }) {
  const rows = useMemo(() => {
    if (!leftPlayer || !rightPlayer) return [];
    return buildRows(leftPlayer, rightPlayer);
  }, [leftPlayer, rightPlayer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-white font-bold">Player Comparison</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[leftPlayer, rightPlayer].map((p) => (
              <div key={p?._id} className="rounded-2xl border border-gray-800 bg-gray-800/30 p-4">
                <p className="text-white font-bold text-lg truncate">{p?.name || 'Unknown Player'}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {roleShort(p?.role)} · {p?.iplTeam || 'Did Not Play'} · {p?.country || '—'}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-900/70 border-b border-gray-800">
              <div className="px-4 py-2.5 text-[11px] text-gray-500 font-bold uppercase tracking-wider">Stat</div>
              <div className="px-4 py-2.5 text-[11px] text-gray-500 font-bold uppercase tracking-wider text-center">Player A</div>
              <div className="px-4 py-2.5 text-[11px] text-gray-500 font-bold uppercase tracking-wider text-center">Player B</div>
            </div>

            <div className="max-h-[52vh] overflow-y-auto">
              {rows.map((row) => {
                const aBetter = row.better === 'a';
                const bBetter = row.better === 'b';
                return (
                  <div key={row.key} className="grid grid-cols-3 border-b border-gray-800/60">
                    <div className="px-4 py-3 text-xs text-gray-300">{row.label}</div>
                    <div
                      className={`px-4 py-3 text-xs text-center ${
                        aBetter ? 'bg-green-500/10 text-green-300 font-bold' : 'text-gray-100'
                      }`}
                    >
                      {renderValue(row, row.aVal)}
                    </div>
                    <div
                      className={`px-4 py-3 text-xs text-center ${
                        bBetter ? 'bg-green-500/10 text-green-300 font-bold' : 'text-gray-100'
                      }`}
                    >
                      {renderValue(row, row.bVal)}
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">
                  Select two players to compare stats.
                </p>
              )}
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Highlights: higher is better for batting stats (Runs/SR/AVG); lower is better for Economy (and bowling averages).
          </p>
        </div>
      </div>
    </div>
  );
}
