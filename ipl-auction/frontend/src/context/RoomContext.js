import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { joinRoom, leaveRoom, getSocket } from '../utils/socket';
import { roomsAPI } from '../utils/api';

const RoomContext = createContext(null);

export const RoomProvider = ({ children }) => {
  // ── persistent session ──────────────────────────────────────────────
  const [sessionId] = useState(() => {
    let sid = localStorage.getItem('sessionId');
    if (!sid) { sid = uuidv4(); localStorage.setItem('sessionId', sid); }
    return sid;
  });

  // ── room state ──────────────────────────────────────────────────────
  const [room,         setRoom]         = useState(null);
  const [roomCode,     setRoomCode]     = useState(() => localStorage.getItem('roomCode') || null);
  const [teamName,     setTeamName]     = useState(() => localStorage.getItem('teamName') || '');
  const [isRestoring,  setIsRestoring]  = useState(true);

  // ── auction real-time state ─────────────────────────────────────────
  const [auctionState,  setAuctionState]  = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [bidHistory,    setBidHistory]    = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [lastBid,       setLastBid]       = useState(null);
  const [auctionResults, setAuctionResults] = useState(null);
  const [roundHistory,  setRoundHistory]  = useState([]);

  const timerRef = useRef(null);

  // ── derived ─────────────────────────────────────────────────────────
  const me       = room?.participants?.find(p => p.sessionId === sessionId) || null;
  const isHost   = room?.hostSession === sessionId;
  const inRoom   = !!room;

  const addNotif = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [{ id, msg, type, time: new Date() }, ...prev].slice(0, 30));
  }, []);

  const addRoundEvent = useCallback((label) => {
    const id = Date.now() + Math.random();
    setRoundHistory(prev => [{ id, label, at: new Date() }, ...prev].slice(0, 20));
  }, []);

  const startLocalTimer = useCallback((seconds) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRemainingTime(seconds);
    timerRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── play bid sound ──────────────────────────────────────────────────
  const playBidSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }, []);

  // ── socket listeners ────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    const on = (ev, fn) => socket.on(ev, fn);

    on('room_state', ({ room: r, remainingTime: rt }) => {
      setRoom(r);
      if (r?.auction) {
        setAuctionState(r.auction);
        setAuctionResults(r.auction.results || null);
        if (rt > 0 && r.auction.status === 'active') startLocalTimer(rt);
      }
    });

    on('room_updated', ({ room: r }) => {
      setRoom(r);
      if (r?.auction) {
        setAuctionState(r.auction);
        setAuctionResults(r.auction.results || null);
      }
    });

    on('participants_updated', ({ participants }) => {
      setRoom(prev => prev ? { ...prev, participants } : prev);
    });

    on('config_updated', ({ config }) => {
      setRoom(prev => prev ? { ...prev, config } : prev);
    });

    on('auction_started', ({ room: r, remainingTime: rt }) => {
      console.log('[socket] auction_started received', {
        roomCode: r?.roomCode,
        status: r?.auction?.status,
        remainingTime: rt,
      });
      setRoom(r);
      setAuctionState(r.auction);
      setBidHistory([]);
      setLastBid(null);
      startLocalTimer(rt);
      toast.success('🏏 Auction Started!');
      addNotif('Auction has started!', 'success');
      addRoundEvent('Round 1 started');
    });

    on('timer_update', ({ remaining }) => {
      setRemainingTime(remaining);
    });

    on('next_player', ({ room: r, remainingTime: rt }) => {
      setRoom(r);
      setAuctionState(r.auction);
      setBidHistory([]);
      setLastBid(null);
      startLocalTimer(rt);
      addNotif(`Now: ${r.auction?.currentPlayer?.name || 'Next player'}`, 'info');
    });

    on('new_bid', ({ bidderName, bidderColor, bidderSession, amount, currentHighestBid, remainingTime: rt }) => {
      setAuctionState(prev => prev ? {
        ...prev,
        currentHighestBid,
        currentHighestBidderName: bidderName,
        currentHighestBidderColor: bidderColor,
        currentHighestBidderSession: bidderSession,
      } : prev);
      const entry = { bidderName, bidderColor, bidderSession, amount };
      setBidHistory(prev => [entry, ...prev].slice(0, 40));
      setLastBid({ ...entry, ts: Date.now() });
      startLocalTimer(rt);
      playBidSound();
      if (bidderSession === sessionId) {
        toast.success(`✅ Your bid of ₹${amount}L is highest!`);
      } else {
        addNotif(`${bidderName} bid ₹${amount}L`, 'bid');
      }
    });

    on('player_sold', ({ player, soldToName, soldToColor, soldPrice, message }) => {
      setAuctionState(prev => prev ? {
        ...prev, currentHighestBid: 0,
        currentHighestBidderSession: null, currentHighestBidderName: null,
      } : prev);
      toast.success(`🔨 ${message}`, { duration: 5000 });
      addNotif(message, 'sold');
      if (timerRef.current) clearInterval(timerRef.current);
      setRemainingTime(0);
    });

    on('player_unsold', ({ player, message }) => {
      toast.error(`❌ ${message}`, { duration: 4000 });
      addNotif(message || 'Player unsold', 'unsold');
      if (timerRef.current) clearInterval(timerRef.current);
      setRemainingTime(0);
    });

    on('auction_paused', ({ message }) => {
      setAuctionState(prev => prev ? { ...prev, status: 'paused' } : prev);
      if (timerRef.current) clearInterval(timerRef.current);
      toast('⏸ ' + message, { icon: '⏸️' });
      addNotif(message, 'warning');
    });

    on('auction_resumed', ({ remainingTime: rt }) => {
      setAuctionState(prev => prev ? { ...prev, status: 'active' } : prev);
      startLocalTimer(rt);
      addNotif('Auction resumed!', 'success');
    });

    on('auction_round_ended', ({ room: r, round, unsoldCount }) => {
      if (r) {
        setRoom(r);
        setAuctionState(r.auction);
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setRemainingTime(0);
      addNotif(`Round ${round} ended. ${unsoldCount} unsold players available for next round.`, 'warning');
      addRoundEvent(`Round ${round} ended (${unsoldCount} unsold)`);
    });

    on('next_round_started', ({ room: r, round, remainingTime: rt }) => {
      if (r) {
        setRoom(r);
        setAuctionState(r.auction);
      }
      startLocalTimer(rt);
      addNotif(`Round ${round} started!`, 'success');
      addRoundEvent(`Round ${round} started`);
    });

    on('auction_completed', ({ room: r, message }) => {
      if (r) setRoom(r);
      setAuctionState(prev => prev ? { ...prev, status: 'completed' } : prev);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success('🏆 ' + message, { duration: 8000 });
      addNotif(message, 'success');
      addRoundEvent('Auction completed');
    });

    on('auction_results', ({ results }) => {
      setAuctionResults(results || null);
      addNotif('Final results are ready', 'success');
    });

    on('budget_update', ({ remainingBudget, newPlayer }) => {
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map(p =>
            p.sessionId === sessionId
              ? { ...p, remainingBudget, squadSize: (p.squadSize || 0) + 1 }
              : p
          ),
        };
      });
    });

    on('announcement', ({ message }) => {
      toast(message, { icon: '📢', duration: 5000 });
      addNotif(message, 'info');
    });

    return () => {
      socket.off('room_state');
      socket.off('room_updated');
      socket.off('participants_updated');
      socket.off('config_updated');
      socket.off('auction_started');
      socket.off('timer_update');
      socket.off('next_player');
      socket.off('new_bid');
      socket.off('player_sold');
      socket.off('player_unsold');
      socket.off('auction_paused');
      socket.off('auction_resumed');
      socket.off('auction_round_ended');
      socket.off('next_round_started');
      socket.off('auction_completed');
      socket.off('auction_results');
      socket.off('budget_update');
      socket.off('announcement');
    };
  }, [sessionId, startLocalTimer, addNotif, playBidSound, addRoundEvent]);

  // ── restore room on refresh ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const restoreRoom = async () => {
      const savedCode = localStorage.getItem('roomCode');
      const savedTeam = localStorage.getItem('teamName');
      if (!savedCode || !savedTeam || !sessionId) {
        if (alive) setIsRestoring(false);
        return;
      }

      try {
        const { data } = await roomsAPI.get(savedCode);
        if (!alive) return;
        setRoom(data.room);
        setRoomCode(data.room.roomCode);
        setTeamName(savedTeam);
        joinRoom(data.room.roomCode, sessionId, savedTeam);
      } catch (_) {
        if (!alive) return;
        setRoom(null);
        setRoomCode(null);
        setTeamName('');
        localStorage.removeItem('roomCode');
        localStorage.removeItem('teamName');
      } finally {
        if (alive) setIsRestoring(false);
      }
    };

    restoreRoom();
    return () => { alive = false; };
  }, [sessionId]);

  // ── actions ─────────────────────────────────────────────────────────
  const enterRoom = useCallback((roomData, myTeamName) => {
    setRoom(roomData);
    setRoomCode(roomData.roomCode);
    setTeamName(myTeamName);
    localStorage.setItem('roomCode', roomData.roomCode);
    localStorage.setItem('teamName', myTeamName);
    joinRoom(roomData.roomCode, sessionId, myTeamName);
  }, [sessionId]);

  const exitRoom = useCallback(() => {
    if (roomCode) leaveRoom(roomCode, sessionId);
    setRoom(null);
    setRoomCode(null);
    setTeamName('');
    setAuctionState(null);
    setBidHistory([]);
    setNotifications([]);
    setLastBid(null);
    setAuctionResults(null);
    setRoundHistory([]);
    if (timerRef.current) clearInterval(timerRef.current);
    localStorage.removeItem('roomCode');
    localStorage.removeItem('teamName');
  }, [roomCode, sessionId]);

  const value = {
    sessionId, room, roomCode, teamName, me, isHost, inRoom,
    isRestoring,
    auctionState, auctionResults, remainingTime, bidHistory, notifications, lastBid, roundHistory,
    enterRoom, exitRoom, addNotif,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

export const useRoom = () => {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
};
