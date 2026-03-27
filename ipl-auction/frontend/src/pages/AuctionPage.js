import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { auctionAPI, formatPrice, aiAPI } from '../utils/api';
import { getSocket } from '../utils/socket';
import {
  Gavel, Play, Pause, SkipForward, LogOut, Crown, Users,
  TrendingUp, ChevronRight, Zap, Flag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import BudgetAlertBanner from '../components/auction/BudgetAlertBanner';
import AISuggestionCard from '../components/auction/AISuggestionCard';
import PlayerComparisonModal from '../components/auction/PlayerComparisonModal';
import AuctionHeatmapDashboard from '../components/auction/AuctionHeatmapDashboard';
import VoiceChatPanel from '../components/auction/VoiceChatPanel';

/* ─── Countdown ring ───────────────────────────────────────────── */
function CountdownRing({ seconds, total = 30 }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const R = 38, C = 2 * Math.PI * R;
  const isDanger  = seconds <= 5  && seconds > 0;
  const isWarning = seconds <= 10 && seconds > 0;
  const stroke    = isDanger ? '#EF4444' : isWarning ? '#F59E0B' : '#22C55E';
  return (
    <div className={`relative inline-flex items-center justify-center ${isDanger ? 'timer-warning' : ''}`}>
      <svg width={92} height={92} className="-rotate-90">
        <circle cx={46} cy={46} r={R} fill="none" stroke="#1F2937" strokeWidth={7} />
        <circle cx={46} cy={46} r={R} fill="none" stroke={stroke} strokeWidth={7}
          strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-2xl leading-none" style={{ color: stroke }}>{seconds}</span>
        <span className="text-gray-600 text-xs">sec</span>
      </div>
    </div>
  );
}

/* ─── Player hero ───────────────────────────────────────────────── */
function PlayerHero({ player }) {
  const roleColors = {
    Batsman:     'text-blue-400 bg-blue-500/10 border-blue-500/30',
    Bowler:      'text-red-400 bg-red-500/10 border-red-500/30',
    'All-rounder':'text-green-400 bg-green-500/10 border-green-500/30',
    Wicketkeeper:'text-purple-400 bg-purple-500/10 border-purple-500/30',
  };
  if (!player) return (
    <div className="rounded-2xl bg-gray-800/40 border border-gray-700/50 h-72 flex items-center justify-center">
      <p className="text-gray-600 font-display font-bold text-lg">No player selected</p>
    </div>
  );
  const stats = player.stats || {};
  const strikeRate = stats.strikeRate ?? stats.sr ?? 0;
  const average = stats.average ?? stats.avg ?? 0;
  const economy = stats.economy ?? stats.eco ?? 0;
  const wickets = stats.wickets ?? stats.wkts ?? 0;
  const battingAverage = stats.battingAverage ?? 0;
  const bowlingAverage = stats.bowlingAverage ?? 0;
  return (
    <div className="rounded-2xl overflow-hidden border border-yellow-500/30 bg-gradient-to-b from-gray-800 to-gray-900 shadow-xl shadow-yellow-500/5">
      <div className="relative h-60">
        <img
          src={player.image || `https://placehold.co/300x300/1F2937/white?text=${player.name?.[0]}`}
          alt={player.name} className="w-full h-full object-cover object-top"
          onError={e => { e.target.src = `https://placehold.co/300x300/1F2937/white?text=${player.name?.[0]}`; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/30 to-transparent" />
        {player.isOverseas && (
          <span className="absolute top-3 left-3 text-xs font-bold px-2 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300">🌍 Overseas</span>
        )}
        <span className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full border ${roleColors[player.role] || roleColors.Batsman}`}>
          {player.role}
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h2 className="font-display font-bold text-white text-2xl leading-tight">{player.name} <span className="text-base text-gray-300">({player.iplTeam || 'Did Not Play'})</span></h2>
          <p className="text-gray-400 text-xs">{player.country}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 border-t border-gray-800/60">
        {[
          { label:'Runs',   val: stats.runs ?? 0 },
          { label:'SR', val: strikeRate },
          { label:'AVG',   val: average },
          { label:'Eco',  val: economy },
          { label:'Wkts', val: wickets },
          { label:'Bat AVG', val: battingAverage },
          { label:'Bowl AVG', val: bowlingAverage },
          { label:'Rating', val: player.rating ?? 0 },
        ].map(({ label, val }, i) => (
          <div key={label} className={`py-3 text-center ${i<3?'border-r border-gray-800/60':''}`}>
            <p className="font-display font-bold text-yellow-400 text-base leading-none">{val}</p>
            <p className="text-gray-600 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function AuctionPage() {
  const navigate = useNavigate();
  const { room, sessionId, isHost, me, auctionState, remainingTime, bidHistory, lastBid, roundHistory, exitRoom } = useRoom();
  const [bidding,   setBidding]   = useState(false);
  const [customBid, setCustomBid] = useState('');
  const [flash,     setFlash]     = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedUnsold, setSelectedUnsold] = useState([]);
  const [roleFilters, setRoleFilters] = useState([]);
  const [teamFilter, setTeamFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('rating_desc');
  const [startingRound, setStartingRound] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const [spendData, setSpendData] = useState(room?.auction?.spendData || []);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const audioContainerRef = useRef(null);

  const socket = getSocket();
  const stunServerUrl = process.env.REACT_APP_STUN_SERVER || 'stun:stun.l.google.com:19302';

  useEffect(() => {
    if (!lastBid) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [lastBid]);

  useEffect(() => {
    const s = auctionState?.status || room?.auction?.status;
    if (s === 'completed') {
      toast.success('🏆 Auction complete!');
      setTimeout(() => navigate('/results'), 1600);
    }
  }, [auctionState?.status, room?.auction?.status, navigate]);

  useEffect(() => {
    setSpendData(room?.auction?.spendData || []);
  }, [room?.auction?.spendData]);

  useEffect(() => {
    if (!room?.roomCode || !sessionId) return;
    let cancelled = false;
    const refreshSuggestion = async () => {
      try {
        setLoadingSuggestion(true);
        const { data } = await aiAPI.suggestion(room.roomCode, sessionId);
        if (!cancelled) setSuggestion(data?.suggestion || null);
      } catch (_) {
        if (!cancelled) setSuggestion(null);
      } finally {
        if (!cancelled) setLoadingSuggestion(false);
      }
    };
    refreshSuggestion();
    return () => { cancelled = true; };
  }, [room?.roomCode, sessionId, auctionState?.currentHighestBid, auctionState?.soldPlayers?.length, room?.auction?.currentHighestBid, room?.auction?.soldPlayers?.length]);

  useEffect(() => {
    const onHeatmap = ({ spendData: nextSpendData }) => setSpendData(nextSpendData || []);
    socket.on('auction_heatmap_update', onHeatmap);
    return () => socket.off('auction_heatmap_update', onHeatmap);
  }, [socket]);

  const auction    = auctionState || room?.auction;
  const player     = auction?.currentPlayer;
  const curBid     = auction?.currentHighestBid || 0;
  const winner     = auction?.currentHighestBidderName;
  const winnerSess = auction?.currentHighestBidderSession;
  const winColor   = auction?.currentHighestBidderColor;
  const isActive   = auction?.status === 'active';
  const isPaused   = auction?.status === 'paused';
  const iAmWinner  = winnerSess === sessionId;
  const quickIncs  = [25, 50, 100];
  const myBudget   = me?.remainingBudget ?? room?.config?.budget ?? 10000;
  const timerTotal = room?.config?.timerSeconds || 30;
  const minInc     = curBid < 200 ? 10 : curBid < 500 ? 20 : curBid < 1000 ? 50 : curBid < 2000 ? 100 : 200;

  const hostAction = async (fn) => {
    try { await fn(); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const placeBid = async (amount) => {
    if (!isActive || bidding) return;
    if (amount <= curBid) return toast.error(`Bid must exceed ${formatPrice(curBid)}`);
    if (amount < curBid + minInc) return toast.error(`Minimum increment is ${formatPrice(minInc)}`);
    if (amount > myBudget) return toast.error(`Insufficient budget. You have ${formatPrice(myBudget)}`);
    setBidding(true);
    try {
      const { data } = await auctionAPI.bid(room.roomCode, { sessionId, amount });
      const alert = data?.budget?.alert;
      if (alert?.level === 'critical') toast.error(alert.message);
      if (alert?.level === 'warning') toast(alert.message, { icon: '⚠️' });
    }
    catch (err) { toast.error(err.response?.data?.message || 'Bid failed'); }
    finally { setBidding(false); }
  };

  const handleCustomBid = () => {
    const amt = parseInt(customBid, 10);
    if (!amt) { toast.error('Enter a valid amount'); return; }
    placeBid(amt); setCustomBid('');
  };

  const soldPlayers = useMemo(() => auction?.soldPlayers || [], [auction?.soldPlayers]);
  const unsoldPool = auction?.unsoldPlayerPool;
  const participants = room?.participants || [];
  const activeTeam = selectedTeam || participants[0] || null;
  const activeSquad = activeTeam
    ? soldPlayers.filter(s => s.soldToSession === activeTeam.sessionId)
    : [];
  const round = auction?.currentRound || 1;
  const isRoundBreak = auction?.status === 'round_break';
  const iplTeams = Array.from(new Set((unsoldPool || []).map(p => p.iplTeam || 'Did Not Play'))).sort();
  const filteredUnsold = (unsoldPool || [])
    .filter((p) => {
      const s = searchTerm.trim().toLowerCase();
      if (!s) return true;
      return (p.name || '').toLowerCase().includes(s) || (p.iplTeam || '').toLowerCase().includes(s);
    })
    .filter((p) => roleFilters.length === 0 || roleFilters.includes(p.role))
    .filter((p) => teamFilter === 'all' || (p.iplTeam || 'Did Not Play') === teamFilter)
    .sort((a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'rating_desc') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'basePrice_desc') return (b.basePrice || 0) - (a.basePrice || 0);
      if (sortBy === 'iplTeam_asc') {
        const t = (a.iplTeam || '').localeCompare(b.iplTeam || '');
        return t !== 0 ? t : (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });
  const comparisonCandidates = useMemo(() => {
    const sold = soldPlayers.map((s) => ({ ...s.player, soldPrice: s.soldPrice }));
    const map = new Map();
    [...(unsoldPool || []), ...sold].forEach((p) => {
      if (!p?._id) return;
      map.set(String(p._id), p);
    });
    return [...map.values()];
  }, [soldPlayers, unsoldPool]);
  const leftPlayer = comparisonCandidates.find((p) => String(p._id) === compareLeftId);
  const rightPlayer = comparisonCandidates.find((p) => String(p._id) === compareRightId);

  const ensureAudioElement = (sessionKey, stream) => {
    if (!audioContainerRef.current) return;
    let el = document.getElementById(`voice-audio-${sessionKey}`);
    if (!el) {
      el = document.createElement('audio');
      el.id = `voice-audio-${sessionKey}`;
      el.autoplay = true;
      audioContainerRef.current.appendChild(el);
    }
    el.srcObject = stream;
  };

  const createPeerConnection = useCallback(async (targetSessionId, shouldCreateOffer = false) => {
    if (!localStreamRef.current || !room?.roomCode) return null;
    if (peerConnectionsRef.current[targetSessionId]) return peerConnectionsRef.current[targetSessionId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: stunServerUrl }],
    });

    localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('voice_ice_candidate', {
        roomCode: room.roomCode,
        to: targetSessionId,
        from: sessionId,
        candidate: event.candidate,
      });
    };
    pc.ontrack = (event) => ensureAudioElement(targetSessionId, event.streams[0]);
    peerConnectionsRef.current[targetSessionId] = pc;

    if (shouldCreateOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_offer', {
        roomCode: room.roomCode,
        to: targetSessionId,
        from: sessionId,
        offer,
      });
    }
    return pc;
  }, [room?.roomCode, sessionId, socket, stunServerUrl]);

  useEffect(() => {
    const onVoiceParticipants = async ({ participants }) => {
      setVoiceParticipants(participants || []);
      if (!voiceJoined) return;
      for (const peerId of participants || []) {
        if (peerId === socket.id) continue;
        await createPeerConnection(peerId, true);
      }
    };
    const onVoiceOffer = async ({ to, from, offer }) => {
      if (to !== socket.id) return;
      const pc = await createPeerConnection(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice_answer', { roomCode: room?.roomCode, to: from, from: socket.id, answer });
    };
    const onVoiceAnswer = async ({ to, from, answer }) => {
      if (to !== socket.id) return;
      const pc = peerConnectionsRef.current[from];
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    };
    const onVoiceIce = async ({ to, from, candidate }) => {
      if (to !== socket.id) return;
      const pc = peerConnectionsRef.current[from] || (await createPeerConnection(from, false));
      if (!pc) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    };
    socket.on('voice_participants', onVoiceParticipants);
    socket.on('voice_offer', onVoiceOffer);
    socket.on('voice_answer', onVoiceAnswer);
    socket.on('voice_ice_candidate', onVoiceIce);
    return () => {
      socket.off('voice_participants', onVoiceParticipants);
      socket.off('voice_offer', onVoiceOffer);
      socket.off('voice_answer', onVoiceAnswer);
      socket.off('voice_ice_candidate', onVoiceIce);
    };
  }, [socket, room?.roomCode, voiceJoined, sessionId, createPeerConnection]);

  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setVoiceJoined(true);
      socket.emit('voice_join', { roomCode: room.roomCode, sessionId: socket.id, teamName: me?.teamName });
    } catch (_) {
      toast.error('Microphone permission denied');
    }
  };

  const leaveVoice = () => {
    setVoiceJoined(false);
    setVoiceParticipants([]);
    socket.emit('voice_leave', { roomCode: room.roomCode, sessionId: socket.id });
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = '';
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const nextMuted = !voiceMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setVoiceMuted(nextMuted);
  };

  useEffect(() => {
    if (isRoundBreak && isHost) {
      setSelectedUnsold((unsoldPool || []).map(p => String(p._id)));
    }
  }, [isRoundBreak, isHost, unsoldPool]);

  if (!room) return null;

  const handleEndRound = async () => {
    if (!isHost) return;
    const ok = window.confirm('Are you sure you want to end the current round?');
    if (!ok) return;
    try {
      await auctionAPI.endRound(room.roomCode, { sessionId });
      toast.success('Round ended');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to end round');
    }
  };

  const toggleUnsold = (id) => {
    setSelectedUnsold(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const toggleRoleFilter = (role) => {
    setRoleFilters(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const startNextRound = async () => {
    if (!selectedUnsold.length) return toast.error('Select at least one player');
    setStartingRound(true);
    try {
      await auctionAPI.nextRound(room.roomCode, { sessionId, selectedPlayerIds: selectedUnsold });
      toast.success(`Round ${round + 1} started`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start next round');
    } finally {
      setStartingRound(false);
    }
  };

  return (
    <div className="min-h-screen bg-ipl-dark">
      {/* navbar */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Gavel className="w-4 h-4 text-gray-900" />
            </div>
            <span className="font-display font-bold text-white hidden sm:block">IPL AUCTION</span>
            <span className="text-gray-700 hidden sm:block">·</span>
            <span className="text-gray-300 text-sm">{room.roomName}</span>
            <span className="font-display font-bold text-yellow-400 text-sm tracking-widest ml-2 hidden sm:block">{room.roomCode}</span>
          </div>
          <div className="flex items-center gap-2">
            {[{ to:'/players',label:'Players'},{to:'/teams',label:'Squads'},{to:'/results',label:'Results'}].map(({to,label})=>(
              <Link key={to} to={to} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700/50 transition-all hidden sm:block">{label}</Link>
            ))}
            {me && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-gray-900" style={{ background: me.color }}>
                  {me.teamName?.[0]?.toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-medium text-white leading-none">{me.teamName}</div>
                  <div className="text-xs text-yellow-400 leading-none mt-0.5">{formatPrice(myBudget)}</div>
                </div>
              </div>
            )}
            {isHost && (
              <button
                onClick={handleEndRound}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all"
              >
                End Auction
              </button>
            )}
            <button onClick={() => { exitRoom(); navigate('/'); }} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        {/* status + host controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {isActive && <div className="live-indicator"><div className="live-dot" /><span className="font-display font-bold text-red-400 text-xs uppercase tracking-widest">LIVE</span></div>}
            {isPaused && <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">⏸ PAUSED</span>}
            {isRoundBreak && <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 border border-blue-500/30 text-blue-300">ROUND BREAK</span>}
            <span className="text-gray-500 text-sm">
              <span className="inline-flex items-center gap-1 mr-2 text-blue-400"><Flag className="w-3.5 h-3.5" />Round {round}</span>
              {auction?.soldPlayers?.length||0} sold · {auction?.unsoldPlayers?.length||0} unsold · {auction?.playerQueue?.length||0} in queue
            </span>
          </div>
          {isHost && (
            <div className="flex items-center gap-2">
              {isActive && (
                <button onClick={() => hostAction(()=>auctionAPI.pause(room.roomCode,{sessionId}))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-yellow-500/20 transition-all">
                  <Pause className="w-4 h-4"/>Pause
                </button>
              )}
              {isPaused && (
                <button onClick={() => hostAction(()=>auctionAPI.resume(room.roomCode,{sessionId}))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-bold hover:bg-green-500/20 transition-all">
                  <Play className="w-4 h-4"/>Resume
                </button>
              )}
              <button onClick={() => hostAction(()=>auctionAPI.skip(room.roomCode,{sessionId}))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-700/60 border border-gray-600 text-gray-300 text-sm font-bold hover:bg-gray-700 transition-all">
                <SkipForward className="w-4 h-4"/>Skip
              </button>
              <button onClick={() => hostAction(()=>auctionAPI.next(room.roomCode,{sessionId}))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-bold hover:bg-orange-500/20 transition-all">
                <ChevronRight className="w-4 h-4"/>Sell & Next
              </button>
            </div>
          )}
        </div>

        {/* 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Player card */}
          <div><PlayerHero player={player}/></div>

          {/* Bid panel */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-4 flex items-center justify-between">
              <CountdownRing seconds={remainingTime} total={timerTotal}/>
              <div className="text-right">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Base Price</p>
                <p className="font-display font-bold text-white text-xl">{formatPrice(player?.basePrice)}</p>
                <p className="text-gray-500 text-xs uppercase tracking-wider mt-2">In Queue</p>
                <p className="font-display font-bold text-gray-300 text-xl">{auction?.playerQueue?.length||0}</p>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 transition-all duration-300 ${
              iAmWinner ? 'border-green-500/50 bg-green-500/5 shadow-lg shadow-green-500/10'
              : flash    ? 'border-yellow-500/60 bg-yellow-500/5'
              : 'border-gray-800 bg-gray-900/60'
            }`}>
              <div className="text-center mb-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Current Highest Bid</p>
                <div className={`font-display font-bold text-5xl transition-transform ${iAmWinner?'text-green-400':'text-yellow-400'} ${flash?'scale-105':'scale-100'}`}>
                  {formatPrice(curBid)}
                </div>
                {winner && (
                  <p className="text-gray-400 text-sm mt-1.5 flex items-center justify-center gap-1.5">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-gray-900" style={{background:winColor||'#FFD700'}}>
                      {winner?.[0]?.toUpperCase()}
                    </span>
                    {iAmWinner ? '✅ You are winning!' : winner}
                  </p>
                )}
              </div>

              <div className="flex justify-between bg-gray-800/60 rounded-xl px-4 py-2.5 mb-4">
                <div>
                  <p className="text-gray-500 text-xs">Your Budget</p>
                  <p className="font-display font-bold text-white text-base">{formatPrice(myBudget)}</p>
                </div>
                {iAmWinner && (
                  <div className="text-right">
                    <p className="text-gray-500 text-xs">Remaining if won</p>
                    <p className="font-display font-bold text-red-400 text-base">{formatPrice(myBudget-curBid)}</p>
                  </div>
                )}
              </div>
              <BudgetAlertBanner alert={me?.budgetAlert} />

              {isActive && !iAmWinner && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {quickIncs.map(inc=>(
                      <button key={inc} disabled={bidding||myBudget<curBid+inc} onClick={()=>placeBid(curBid+inc)}
                        className="py-2.5 rounded-xl font-display font-bold text-sm border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        +{inc === 100 ? '1 Cr' : `${inc} L`}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">Next valid bid: <span className="text-yellow-400 font-bold">{formatPrice(curBid + minInc)}</span></p>
                  <div className="flex gap-2">
                    <input type="number" value={customBid} onChange={e=>setCustomBid(e.target.value)} placeholder={`>${formatPrice(curBid)}`}
                      onKeyPress={e=>e.key==='Enter'&&handleCustomBid()}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-yellow-500 placeholder-gray-600"/>
                    <button onClick={handleCustomBid} disabled={bidding||!customBid}
                      className="px-4 py-2.5 rounded-xl bg-gray-700 border border-gray-600 text-white hover:bg-gray-600 transition-colors disabled:opacity-40">
                      <Zap className="w-4 h-4"/>
                    </button>
                  </div>
                  <button onClick={()=>placeBid(curBid + minInc)} disabled={bidding||!isActive||myBudget < curBid + minInc}
                    className="w-full btn-primary py-4 rounded-xl font-display text-lg font-bold tracking-wide flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    {bidding
                      ? <div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin"/>
                      : <><Gavel className="w-5 h-5"/>BID {formatPrice(curBid + minInc)}</>}
                  </button>
                </div>
              )}
              {iAmWinner && isActive && <p className="text-center text-green-400 text-sm font-bold font-display py-1">✓ You're the highest bidder!</p>}
              {isPaused && <p className="text-center text-yellow-400/70 text-sm py-2">⏸ Auction paused</p>}
              {isRoundBreak && <p className="text-center text-blue-300/80 text-sm py-2">Round ended. Waiting for next round setup.</p>}
            </div>
            <AISuggestionCard suggestion={suggestion} loading={loadingSuggestion} />
            <AuctionHeatmapDashboard spendData={spendData} />
          </div>

          {/* Bid history + teams */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Flag className="w-4 h-4 text-blue-400"/>
                <span className="font-display font-bold text-white text-sm uppercase tracking-wide">Round Timeline</span>
              </div>
              <div className="max-h-36 overflow-y-auto p-3 space-y-2">
                {roundHistory.length === 0 && <p className="text-xs text-gray-600">No round events yet</p>}
                {roundHistory.map((e) => (
                  <div key={e.id} className="text-xs text-gray-300 border border-gray-800 rounded-lg px-2 py-1.5 bg-gray-800/30">
                    {e.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-yellow-400"/>
                <span className="font-display font-bold text-white text-sm uppercase tracking-wide">Bid History</span>
                <span className="ml-auto text-xs text-gray-600">{bidHistory.length}</span>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {bidHistory.length===0
                  ? <p className="text-center text-gray-600 text-sm py-6">No bids yet — be first!</p>
                  : bidHistory.map((b,i)=>(
                    <div key={i} className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/40 ${i===0?'bg-yellow-500/5':'hover:bg-gray-800/20'}`}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-gray-900 flex-shrink-0" style={{background:b.bidderColor||'#FFD700'}}>
                        {b.bidderName?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{b.bidderName}</p>
                        {i===0 && <p className="text-yellow-400 text-xs">Highest</p>}
                      </div>
                      <p className={`font-display font-bold text-sm ${i===0?'text-yellow-400':'text-gray-500'}`}>{formatPrice(b.amount)}</p>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400"/>
                <span className="font-display font-bold text-white text-sm uppercase tracking-wide">Live Squad Viewer</span>
              </div>
              <div className="p-2 max-h-52 overflow-y-auto">
                {participants.map((p,i)=>{
                  const teamCount = soldPlayers.filter(s => s.soldToSession === p.sessionId).length;
                  const active = (activeTeam?.sessionId || '') === p.sessionId;
                  return (
                  <button key={i} onClick={() => setSelectedTeam(p)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left ${active?'bg-blue-500/10 border border-blue-500/20':'hover:bg-gray-800/40'}`}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-gray-900 flex-shrink-0" style={{background:p.color}}>
                      {p.teamName?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate flex items-center gap-1">
                        {p.teamName} {p.isHost&&<Crown className="w-3 h-3 text-yellow-400"/>}
                      </p>
                      <p className="text-[11px] text-gray-500">{teamCount} players</p>
                    </div>
                    <p className="text-yellow-400 text-xs font-bold font-display flex-shrink-0">{formatPrice(p.remainingBudget)}</p>
                    <div className={`w-1.5 h-1.5 rounded-full ${p.isOnline?'bg-green-400':'bg-gray-700'}`}/>
                  </button>
                )})}
              </div>
              <div className="border-t border-gray-800 p-3 bg-gray-900/70">
                <p className="text-xs text-gray-500 mb-2">{activeTeam ? `${activeTeam.teamName} Squad` : 'Select a team to inspect squad'}</p>
                <div className="max-h-44 overflow-y-auto space-y-2">
                  {activeSquad.length === 0 && <p className="text-xs text-gray-600 italic">No players acquired yet</p>}
                  {activeSquad.map((s, idx) => (
                    <div key={`${s.player?._id || idx}-${idx}`} className="flex items-center gap-2 rounded-lg bg-gray-800/50 border border-gray-700/60 px-2 py-1.5">
                      <img
                        src={s.player?.image || `https://placehold.co/32x32/1F2937/white?text=${s.player?.name?.[0] || 'P'}`}
                        alt={s.player?.name || 'Player'}
                        className="w-8 h-8 rounded-md object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">
                          {s.player?.name || 'Unknown Player'} <span className="text-gray-400">({s.player?.iplTeam || 'Did Not Play'})</span>
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {s.player?.role || 'Unknown role'} · SR {s.player?.stats?.strikeRate ?? s.player?.stats?.sr ?? 0}
                          {' '}· AVG {s.player?.stats?.average ?? s.player?.stats?.avg ?? 0}
                          {' '}· Eco {s.player?.stats?.economy ?? s.player?.stats?.eco ?? 0}
                        </p>
                      </div>
                      <p className="text-xs text-green-400 font-bold font-display">{formatPrice(s.soldPrice)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Player Comparison</h3>
              <div className="grid grid-cols-2 gap-2">
                <select value={compareLeftId} onChange={(e) => setCompareLeftId(e.target.value)} className="px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-white">
                  <option value="">Select Player A</option>
                  {comparisonCandidates.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <select value={compareRightId} onChange={(e) => setCompareRightId(e.target.value)} className="px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-white">
                  <option value="">Select Player B</option>
                  {comparisonCandidates.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <button
                onClick={() => setComparisonOpen(true)}
                disabled={!compareLeftId || !compareRightId}
                className="w-full px-3 py-2 rounded-lg bg-blue-500/15 border border-blue-500/40 text-blue-300 text-sm disabled:opacity-40"
              >
                Compare Players
              </button>
            </div>
            <VoiceChatPanel
              joined={voiceJoined}
              muted={voiceMuted}
              participants={voiceParticipants}
              onJoin={joinVoice}
              onLeave={leaveVoice}
              onToggleMute={toggleMute}
            />
          </div>
        </div>
      </div>
      <div ref={audioContainerRef} />

      {isRoundBreak && isHost && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-700 bg-gray-900 max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="font-display font-bold text-white text-lg">Select Players for Round {round + 1}</h3>
              <p className="text-xs text-gray-500 mt-1">{(unsoldPool || []).length} unsold players available</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setSelectedUnsold((unsoldPool || []).map(p => String(p._id)))} className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800">Select All</button>
                <button onClick={() => setSelectedUnsold([])} className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800">Clear</button>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or IPL team..."
                  className="ml-auto px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-white min-w-56"
                />
                <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-white">
                  <option value="all">All IPL Teams</option>
                  {iplTeams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-white">
                  <option value="rating_desc">Sort: Rating</option>
                  <option value="basePrice_desc">Sort: Base Price</option>
                  <option value="name_asc">Sort: Name</option>
                  <option value="iplTeam_asc">Sort: IPL Team</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Batsman','Bowler','All-rounder','Wicketkeeper'].map((r) => {
                  const active = roleFilters.includes(r);
                  return (
                    <button key={r} onClick={() => toggleRoleFilter(r)} className={`px-2.5 py-1 rounded-lg text-xs border ${active ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                      {r}
                    </button>
                  );
                })}
              </div>
              <div className="max-h-[48vh] overflow-y-auto border border-gray-800 rounded-xl">
                <div className="grid grid-cols-12 text-[11px] uppercase tracking-wider text-gray-500 px-3 py-2 border-b border-gray-800 bg-gray-900/80">
                  <div className="col-span-1">Pick</div>
                  <div className="col-span-4">Player</div>
                  <div className="col-span-2">Role</div>
                  <div className="col-span-2">IPL Team</div>
                  <div className="col-span-1 text-right">Rating</div>
                  <div className="col-span-2 text-right">Base</div>
                </div>
                {filteredUnsold.map((p) => {
                  const id = String(p._id);
                  const active = selectedUnsold.includes(id);
                  const isTopRated = (p.rating || 0) >= 85;
                  return (
                    <label key={id} className={`grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-gray-800/70 cursor-pointer ${active ? 'bg-yellow-500/10' : 'hover:bg-gray-800/50'}`}>
                      <div className="col-span-1">
                        <input type="checkbox" checked={active} onChange={() => toggleUnsold(id)} />
                      </div>
                      <div className="col-span-4 min-w-0">
                        <p className="text-sm text-white font-medium truncate">
                          {p.name} {isTopRated && <span className="text-[10px] text-yellow-400">TOP</span>}
                        </p>
                      </div>
                      <div className="col-span-2 text-xs text-gray-300">{p.role}</div>
                      <div className="col-span-2 text-xs text-gray-300 truncate">{p.iplTeam || 'Did Not Play'}</div>
                      <div className="col-span-1 text-xs text-right text-yellow-400 font-semibold">{p.rating || 0}</div>
                      <div className="col-span-2 text-xs text-right text-green-400 font-semibold">{formatPrice(p.basePrice)}</div>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{selectedUnsold.length} selected</p>
                <button onClick={startNextRound} disabled={!selectedUnsold.length || startingRound} className="px-4 py-2 rounded-xl btn-primary disabled:opacity-40">
                  {startingRound ? 'Starting...' : `Start Round ${round + 1}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRoundBreak && !isHost && (
        <div className="fixed bottom-4 right-4 px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-sm">
          Waiting for host to select players for the next round...
        </div>
      )}
      <PlayerComparisonModal
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        leftPlayer={leftPlayer}
        rightPlayer={rightPlayer}
      />
    </div>
  );
}
