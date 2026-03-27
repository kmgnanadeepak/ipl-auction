import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomsAPI } from '../utils/api';
import { useRoom }  from '../context/RoomContext';
import { Gavel, Plus, LogIn, Users, Trophy, Zap, X, AlertCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

/* ── tiny shared input ──────────────────────────────────────────── */
const Field = ({ label, value, onChange, placeholder, maxLength = 40 }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full px-4 py-3 rounded-xl bg-gray-800/80 border border-gray-700 text-white
                 placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:ring-1
                 focus:ring-yellow-500/30 transition-all text-sm"
    />
  </div>
);

/* ── modal shell ────────────────────────────────────────────────── */
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h2 className="font-display font-bold text-white text-xl">{title}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

/* ── error banner ───────────────────────────────────────────────── */
const Err = ({ msg }) => msg ? (
  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
    <AlertCircle className="w-4 h-4 flex-shrink-0" />{msg}
  </div>
) : null;

/* ════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const navigate     = useNavigate();
  const { enterRoom, sessionId } = useRoom();
  const [modal, setModal]   = useState(null); // 'create' | 'join'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Create Room form
  const [createForm, setCreateForm] = useState({ roomName: '', teamName: '' });
  // Join Room form
  const [joinForm,   setJoinForm]   = useState({ roomCode: '', teamName: '' });

  const openModal = (m) => { setModal(m); setError(''); };
  const closeModal= ()  => { setModal(null); setError(''); };

  /* ── CREATE ─────────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.roomName.trim()) return setError('Room name is required');
    if (!createForm.teamName.trim()) return setError('Your team name is required');
    setError(''); setLoading(true);
    try {
      const { data } = await roomsAPI.create({ ...createForm, sessionId });
      enterRoom(data.room, createForm.teamName.trim());
      toast.success(`Room ${data.roomCode} created! You are the host.`);
      navigate('/lobby');
    } catch (err) {
      setError(
        err.response?.data?.message
        || (err.request ? 'Could not reach backend API. Check deployed API URL/CORS configuration.' : null)
        || 'Failed to create room'
      );
    } finally { setLoading(false); }
  };

  /* ── JOIN ───────────────────────────────────────────────────── */
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinForm.roomCode.trim()) return setError('Room code is required');
    if (!joinForm.teamName.trim()) return setError('Your team name is required');
    setError(''); setLoading(true);
    try {
      const { data } = await roomsAPI.join({
        roomCode: joinForm.roomCode.trim().toUpperCase(),
        teamName: joinForm.teamName.trim(),
        sessionId,
      });
      enterRoom(data.room, joinForm.teamName.trim());
      toast.success(data.rejoined ? 'Rejoined room!' : `Joined ${data.room.roomName}!`);
      // If auction already in progress, go straight to auction
      navigate(data.room.status === 'auction' ? '/auction' : '/lobby');
    } catch (err) {
      setError(
        err.response?.data?.message
        || (err.request ? 'Could not reach backend API. Check deployed API URL/CORS configuration.' : null)
        || 'Failed to join room'
      );
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-ipl-dark flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* ── ambient blobs ──────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        {/* floating particles */}
        {[...Array(12)].map((_, i) => (
          <div key={i}
            className="absolute w-1 h-1 rounded-full bg-yellow-400/20"
            style={{
              left: `${10 + i * 8}%`, top: `${20 + (i % 5) * 15}%`,
              animation: `float ${3 + i * 0.4}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-lg relative z-10">

        {/* ── logo / hero ─────────────────────────────────────── */}
        <div className="text-center mb-12">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mx-auto shadow-2xl shadow-yellow-500/30">
              <Gavel className="w-10 h-10 text-gray-900" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />
          </div>
          <h1 className="text-5xl font-display font-bold gradient-text tracking-wider mb-2">
            IPL AUCTION
          </h1>
          <p className="text-gray-400 text-base">
            Create a private room · Invite friends · Bid live
          </p>
        </div>

        {/* ── action cards ────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Create */}
          <button onClick={() => openModal('create')}
            className="group relative overflow-hidden rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-orange-500/5
                       p-6 text-left hover:border-yellow-500/60 hover:shadow-lg hover:shadow-yellow-500/10 transition-all duration-200 hover:-translate-y-0.5">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center mb-4 group-hover:bg-yellow-500/30 transition-colors">
              <Plus className="w-6 h-6 text-yellow-400" />
            </div>
            <h3 className="font-display font-bold text-white text-xl mb-1">Create Room</h3>
            <p className="text-gray-500 text-sm">Start a new auction room and invite participants</p>
            <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-yellow-500/40 group-hover:text-yellow-400 group-hover:translate-x-1 transition-all" />
          </button>

          {/* Join */}
          <button onClick={() => openModal('join')}
            className="group relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-500/5
                       p-6 text-left hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 hover:-translate-y-0.5">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-colors">
              <LogIn className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-display font-bold text-white text-xl mb-1">Join Room</h3>
            <p className="text-gray-500 text-sm">Enter a room code to join an existing auction</p>
            <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-blue-500/40 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
          </button>
        </div>

        {/* ── feature pills ───────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            { icon: Users,  label: 'Up to 20 teams' },
            { icon: Zap,    label: 'Real-time bidding' },
            { icon: Trophy, label: '311 IPL players' },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700/50 text-gray-400 text-xs font-medium">
              <Icon className="w-3.5 h-3.5 text-yellow-500/70" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════ CREATE ROOM MODAL ═══════════════════════ */}
      {modal === 'create' && (
        <Modal title="🏏 Create New Room" onClose={closeModal}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Err msg={error} />
            <Field label="Room Name" value={createForm.roomName}
              onChange={v => setCreateForm(f => ({ ...f, roomName: v }))}
              placeholder="e.g. IPL Auction 2024" />
            <Field label="Your Team Name" value={createForm.teamName}
              onChange={v => setCreateForm(f => ({ ...f, teamName: v }))}
              placeholder="e.g. Chennai Kings" />
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <span className="text-yellow-500">★</span> You'll be the host with full auction controls
            </p>
            <button type="submit" disabled={loading}
              className="w-full btn-primary py-3 rounded-xl font-display text-lg font-bold tracking-wide
                         flex items-center justify-center gap-2 disabled:opacity-50">
              {loading
                ? <><div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />Creating…</>
                : <><Plus className="w-5 h-5" />Create Room</>}
            </button>
          </form>
        </Modal>
      )}

      {/* ═══════════════ JOIN ROOM MODAL ═════════════════════════ */}
      {modal === 'join' && (
        <Modal title="🎯 Join a Room" onClose={closeModal}>
          <form onSubmit={handleJoin} className="space-y-4">
            <Err msg={error} />
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Room Code</label>
              <input
                value={joinForm.roomCode}
                onChange={e => setJoinForm(f => ({ ...f, roomCode: e.target.value.toUpperCase() }))}
                placeholder="e.g. AB3X9K"
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl bg-gray-800/80 border border-gray-700 text-white text-center
                           text-2xl font-display font-bold tracking-[0.3em] placeholder-gray-700
                           focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 transition-all uppercase"
              />
            </div>
            <Field label="Your Team Name" value={joinForm.teamName}
              onChange={v => setJoinForm(f => ({ ...f, teamName: v }))}
              placeholder="e.g. Mumbai Blasters" />
            <button type="submit" disabled={loading}
              className="w-full btn-primary py-3 rounded-xl font-display text-lg font-bold tracking-wide
                         flex items-center justify-center gap-2 disabled:opacity-50">
              {loading
                ? <><div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />Joining…</>
                : <><LogIn className="w-5 h-5" />Join Room</>}
            </button>
          </form>
        </Modal>
      )}

      <style>{`
        @keyframes float {
          from { transform: translateY(0px); opacity: 0.2; }
          to   { transform: translateY(-12px); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
