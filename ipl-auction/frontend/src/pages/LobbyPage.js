import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { roomsAPI, auctionAPI, formatPrice } from '../utils/api';
import {
  Copy, Check, Users, Settings, Play, Crown,
  LogOut, ChevronDown, Gavel, Shield, Info, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── tiny reusable select ──────────────────────────────────────── */
const Select = ({ label, value, onChange, options, disabled }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none px-4 py-2.5 pr-9 rounded-xl bg-gray-800 border border-gray-700
                   text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  </div>
);

/* ─── section card wrapper ──────────────────────────────────────── */
const Section = ({ title, icon: Icon, accent = 'yellow', children, className = '' }) => {
  const accents = {
    yellow: 'from-yellow-500/10 border-yellow-500/20 text-yellow-400',
    blue:   'from-blue-500/10 border-blue-500/20 text-blue-400',
    green:  'from-green-500/10 border-green-500/20 text-green-400',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${accents[accent]} border bg-gray-900/50 overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${accents[accent].split(' ')[2]}`} />
        <span className="font-display font-bold text-white text-sm uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
export default function LobbyPage() {
  const navigate = useNavigate();
  const { room, sessionId, isHost, me, auctionState, exitRoom } = useRoom();
  const [copied,    setCopied]  = useState(false);
  const [starting,  setStarting] = useState(false);
  const [saving,    setSaving]   = useState(false);

  // Local config state (host edits, then saves)
  const [cfg, setCfg] = useState(() => room?.config || {
    budget: 10000, squadSize: 15, timerSeconds: 30,
    playerOrder: 'category',
    categories: ['Batsman','Bowler','All-rounder','Wicketkeeper'],
  });

  const participants = room.participants || [];
  const hostPart     = participants.find(p => p.isHost);
  const config       = room.config || cfg;
  const aiEnabled = !!room.aiEnabled;

  useEffect(() => {
    const status = auctionState?.status || room?.auction?.status || room?.status;
    if (status === 'active' || status === 'auction') {
      navigate('/auction');
    }
  }, [auctionState?.status, room?.auction?.status, room?.status, navigate]);

  /* ── copy room code ──────────────────────────────────────────── */
  const copyCode = () => {
    navigator.clipboard.writeText(room.roomCode).catch(() => {});
    setCopied(true);
    toast.success('Room code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── save config ─────────────────────────────────────────────── */
  const saveConfig = useCallback(async (patch) => {
    if (!isHost) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    setSaving(true);
    try {
      await roomsAPI.setConfig(room.roomCode, { sessionId, config: next });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save config');
    } finally { setSaving(false); }
  }, [isHost, cfg, room.roomCode, sessionId]);

  /* ── toggle category ─────────────────────────────────────────── */
  const toggleCategory = (cat) => {
    if (!isHost) return;
    const cats = cfg.categories || [];
    const next = cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat];
    if (next.length === 0) { toast.error('Select at least one category'); return; }
    saveConfig({ categories: next });
  };

  /* ── start auction ───────────────────────────────────────────── */
  const handleStart = async () => {
    if (participants.length < 1) { toast.error('Need at least 1 participant'); return; }
    setStarting(true);
    try {
      await auctionAPI.start(room.roomCode, { sessionId });
      navigate('/auction');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start');
    } finally { setStarting(false); }
  };

  /* ── leave room ──────────────────────────────────────────────── */
  const handleLeave = () => {
    exitRoom();
    navigate('/');
  };

  /* ── budget labels ───────────────────────────────────────────── */
  const budgetOpts = [
    { value: 5000,  label: '₹50 Cr'  },
    { value: 7500,  label: '₹75 Cr'  },
    { value: 10000, label: '₹100 Cr' },
    { value: 15000, label: '₹150 Cr' },
    { value: 20000, label: '₹200 Cr' },
  ];
  const squadOpts  = [11,15,20,25].map(v => ({ value: v, label: `${v} players` }));
  const timerOpts  = [10,20,30,60].map(v => ({ value: v, label: `${v} seconds` }));
  const orderOpts  = [
    { value: 'category', label: 'Category-wise (BAT → WK → AR → BOWL)' },
    { value: 'random',   label: 'Random Order' },
  ];
  const CATEGORIES = ['Batsman','Bowler','All-rounder','Wicketkeeper'];
  const catColors  = {
    Batsman:     'border-blue-500/40 text-blue-400 bg-blue-500/10',
    Bowler:      'border-red-500/40 text-red-400 bg-red-500/10',
    'All-rounder':'border-green-500/40 text-green-400 bg-green-500/10',
    Wicketkeeper:'border-purple-500/40 text-purple-400 bg-purple-500/10',
  };

  if (!room) return null;

  return (
    <div className="min-h-screen bg-ipl-dark">
      {/* ── top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Gavel className="w-4 h-4 text-gray-900" />
            </div>
            <span className="font-display font-bold text-white tracking-wide hidden sm:block">IPL AUCTION</span>
            <span className="text-gray-600 hidden sm:block">·</span>
            <span className="text-gray-300 text-sm font-medium">{room.roomName}</span>
          </div>
          <div className="flex items-center gap-2">
            {me && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-gray-900"
                  style={{ background: me.color }}>
                  {me.teamName?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-white font-medium hidden sm:block">{me.teamName}</span>
                {isHost && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
              </div>
            )}
            <button onClick={handleLeave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400
                         hover:text-red-400 hover:bg-red-500/10 border border-gray-700 hover:border-red-500/30 transition-all">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Leave</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── waiting banner ──────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-yellow-500/5 border border-yellow-500/20">
          <div className="live-indicator">
            <div className="live-dot" style={{ background: '#FFD700' }} />
          </div>
          <p className="text-yellow-300/80 text-sm font-medium">
            {isHost ? 'You are the host. Configure settings below and start when ready.' : `Waiting for host (${hostPart?.teamName || '…'}) to start the auction.`}
          </p>
          {aiEnabled && (
            <span className="ml-auto px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 border border-blue-500/40 text-blue-200">
              AI Mode Enabled
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ══ LEFT COLUMN (room info + participants) ══════════ */}
          <div className="lg:col-span-2 space-y-5">

            {/* ─ Room Details ─────────────────────────────────── */}
            <Section title="Room Details" icon={Info} accent="yellow">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Room Name</p>
                  <p className="text-white font-display font-bold text-xl">{room.roomName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Room Code</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center justify-center px-4 py-3 rounded-xl bg-gray-800 border border-yellow-500/30">
                      <span className="font-display font-bold text-yellow-400 text-3xl tracking-[0.35em]">
                        {room.roomCode}
                      </span>
                    </div>
                    <button onClick={copyCode}
                      className={`p-3 rounded-xl border transition-all ${
                        copied
                          ? 'bg-green-500/10 border-green-500/40 text-green-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-400'
                      }`}>
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">Share this code with friends to let them join</p>
                </div>
              </div>
            </Section>

            {/* ─ Participants ─────────────────────────────────── */}
            <Section title={`Participants  ${participants.length} / ${room.maxParticipants}`} icon={Users} accent="blue">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {participants.length === 0 && (
                  <p className="text-center text-gray-600 text-sm py-4">No participants yet</p>
                )}
                {participants.map((p, i) => (
                  <div key={p.sessionId || i}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      p.sessionId === sessionId ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-800/40 border border-transparent'
                    }`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-gray-900 flex-shrink-0 shadow-md"
                      style={{ background: p.color }}>
                      {p.teamName?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-white text-sm truncate">{p.teamName}</span>
                        {p.isHost && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                        {p.sessionId === sessionId && (
                          <span className="text-xs text-yellow-400/70 font-medium">(you)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{formatPrice(p.remainingBudget)} budget</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                  </div>
                ))}
              </div>
              {participants.length >= room.maxParticipants && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">
                  Room is full ({room.maxParticipants}/{room.maxParticipants})
                </div>
              )}
            </Section>
          </div>

          {/* ══ RIGHT COLUMN (auction config + start) ══════════ */}
          <div className="lg:col-span-3 space-y-5">

            {/* ─ Auction Configuration ────────────────────────── */}
            <Section title="Auction Configuration" icon={Settings} accent="yellow">
              {!isHost && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  Settings are controlled by the host. You can view but not change them.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Starting Budget"
                  value={cfg.budget}
                  onChange={v => saveConfig({ budget: Number(v) })}
                  options={budgetOpts}
                  disabled={!isHost}
                />
                <Select
                  label="Squad Size Limit"
                  value={cfg.squadSize}
                  onChange={v => saveConfig({ squadSize: Number(v) })}
                  options={squadOpts}
                  disabled={!isHost}
                />
                <Select
                  label="Timer Per Player"
                  value={cfg.timerSeconds}
                  onChange={v => saveConfig({ timerSeconds: Number(v) })}
                  options={timerOpts}
                  disabled={!isHost}
                />
                <Select
                  label="Player Order"
                  value={cfg.playerOrder}
                  onChange={v => saveConfig({ playerOrder: v })}
                  options={orderOpts}
                  disabled={!isHost}
                />
              </div>

              {/* Category filter */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Player Categories</label>
                  {saving && <span className="text-xs text-yellow-400/70 animate-pulse">Saving…</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => {
                    const active = (cfg.categories || []).includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        disabled={!isHost}
                        className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all
                                    disabled:cursor-not-allowed ${
                          active
                            ? `${catColors[cat]} shadow-sm`
                            : 'border-gray-700 text-gray-600 bg-gray-800/40 hover:border-gray-600'
                        } ${isHost ? 'hover:opacity-90' : ''}`}
                      >
                        {cat === 'All-rounder' ? 'All-Rdr' : cat}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {(cfg.categories || []).length} / 4 categories selected
                </p>
              </div>
            </Section>

            {/* ─ Config summary card ──────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Budget',     value: formatPrice(config.budget) },
                { label: 'Squad Size', value: `${config.squadSize} players` },
                { label: 'Timer',      value: `${config.timerSeconds}s` },
                { label: 'Order',      value: config.playerOrder === 'category' ? 'Category' : 'Random' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-gray-800/60 border border-gray-700/50 px-4 py-3 text-center">
                  <p className="font-display font-bold text-white text-lg leading-tight">{value}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* ─ Start Auction button (host only) ─────────────── */}
            {isHost ? (
              <button
                onClick={handleStart}
                disabled={starting || participants.length < 1}
                className="w-full py-4 rounded-2xl font-display text-xl font-bold tracking-wide btn-primary
                           flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30 transition-shadow"
              >
                {starting ? (
                  <><div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />Starting…</>
                ) : (
                  <><Play className="w-6 h-6" />Start Auction</>
                )}
              </button>
            ) : (
              <div className="w-full py-4 rounded-2xl bg-gray-800/50 border border-gray-700/50 text-center">
                <div className="flex items-center justify-center gap-2 text-gray-400">
                  <Sparkles className="w-5 h-5 text-yellow-500/50 animate-pulse" />
                  <span className="font-display font-bold text-lg">Waiting for host to start…</span>
                </div>
                <p className="text-gray-600 text-sm mt-1">
                  Host: <span className="text-gray-400 font-medium">{hostPart?.teamName || '—'}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
