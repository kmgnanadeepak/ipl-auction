import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'Batsman', label: 'Batsmen' },
  { value: 'Bowler', label: 'Bowlers' },
  { value: 'All-rounder', label: 'All-Rounders' },
  { value: 'Wicketkeeper', label: 'Wicketkeepers' },
];

export default function PlayerPicker({
  label,
  players,
  valueId,
  onChangeId,
  placeholder = 'Select player…',
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');

  const selected = useMemo(
    () => (players || []).find((p) => String(p?._id) === String(valueId)),
    [players, valueId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players || [])
      .filter((p) => (role === 'all' ? true : p?.role === role))
      .filter((p) => {
        if (!q) return true;
        return String(p?.name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [players, query, role]);

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-left text-sm text-white hover:border-gray-600 transition-colors"
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="font-semibold">{selected.name}</span>{' '}
              <span className="text-gray-400">({selected.role || 'Role'} · {selected.iplTeam || 'Did Not Play'})</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
          <div className="p-3 border-b border-gray-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:border-yellow-500"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-600 py-6 text-center">No players found</p>
            )}
            {filtered.map((p) => {
              const id = String(p?._id);
              const active = id === String(valueId);
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    onChangeId(id);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors ${
                    active ? 'bg-yellow-500/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-semibold truncate">{p?.name || 'Unknown'}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {p?.role || 'Role'} · {p?.iplTeam || 'Did Not Play'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] text-gray-500">SR {p?.stats?.strikeRate ?? p?.stats?.sr ?? 0}</p>
                      <p className="text-[11px] text-gray-500">AVG {p?.stats?.average ?? p?.stats?.avg ?? 0}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

