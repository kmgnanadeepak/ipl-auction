import React from 'react';
import { Link } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { formatPrice } from '../utils/api';
import { Crown, ArrowLeft, Trophy } from 'lucide-react';

const roleColors = {
  Batsman:'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Bowler:'text-red-400 bg-red-500/10 border-red-500/30',
  'All-rounder':'text-green-400 bg-green-500/10 border-green-500/30',
  Wicketkeeper:'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

export default function TeamsPage() {
  const { room, sessionId, auctionState } = useRoom();
  if (!room) return null;

  const auction     = auctionState || room?.auction;
  const participants = [...(room.participants||[])].sort((a,b)=>(b.squadSize||0)-(a.squadSize||0));

  return (
    <div className="min-h-screen bg-ipl-dark">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/auction" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5"/>
          </Link>
          <h1 className="font-display font-bold text-white text-xl">Team Squads</h1>
          <span className="text-gray-600 text-sm">{room.roomName}</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {/* sold summary */}
        {auction?.soldPlayers?.length > 0 && (
          <div className="ipl-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-green-400"/>
              <h2 className="font-display font-bold text-white text-lg">Sold Players</h2>
              <span className="text-gray-500 text-sm">{auction.soldPlayers.length} players sold</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
              {[...(auction.soldPlayers||[])].reverse().map((s,i)=>(
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-900"
                    style={{background:s.soldToColor||'#FFD700'}}>
                    {s.soldToName?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold font-display truncate">{s.player?.name||'—'}</p>
                    <p className="text-gray-500 text-xs truncate">{s.soldToName}</p>
                  </div>
                  <p className="text-green-400 font-bold font-display text-sm flex-shrink-0">{formatPrice(s.soldPrice)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* team cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {participants.map((p,i)=>{
            const spent = (p.budget||10000) - (p.remainingBudget||0);
            const pct   = Math.min(100, (spent / (p.budget||10000)) * 100).toFixed(0);
            const isMe  = p.sessionId === sessionId;
            // gather sold players for this team
            const mySold = (auction?.soldPlayers||[]).filter(s=>s.soldToSession===p.sessionId);
            return (
              <div key={p.sessionId||i}
                className={`ipl-card p-5 overflow-hidden relative ${isMe?'border-yellow-500/40':'border-gray-800'} hover:border-yellow-500/20 transition-all`}
                style={{borderColor:`${p.color}30`}}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 -mr-8 -mt-8" style={{background:p.color}}/>
                <div className="flex items-start gap-4 mb-4 relative">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-gray-900 shadow-lg flex-shrink-0"
                    style={{background:p.color}}>
                    {p.teamName?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {i===0 && <Trophy className="w-4 h-4 text-yellow-400"/>}
                      <h3 className="font-display font-bold text-white text-lg truncate">{p.teamName}</h3>
                      {p.isHost && <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0"/>}
                      {isMe && <span className="text-xs text-yellow-400/70 font-medium">(you)</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">#{i+1} · {mySold.length} players</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1 ${p.isOnline?'bg-green-400':'bg-gray-600'}`}/>
                </div>

                {/* budget bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Budget used</span>
                    <span className="text-white font-bold">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,background:p.color}}/>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-600">Spent: <span className="text-red-400 font-medium">{formatPrice(spent)}</span></span>
                    <span className="text-gray-600">Left: <span className="text-green-400 font-medium">{formatPrice(p.remainingBudget)}</span></span>
                  </div>
                </div>

                {/* squad pills */}
                {mySold.length > 0 ? (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {mySold.map((s,j)=>(
                      <div key={j} className={`text-xs px-2 py-1 rounded-lg border font-medium flex items-center justify-between ${roleColors[s.player?.role]||'text-gray-400 bg-gray-700 border-gray-600'}`}>
                        <span className="truncate pr-2">{s.player?.name||'—'} <span className="text-gray-500">({s.player?.iplTeam || 'Did Not Play'})</span></span>
                        <span className="text-green-400 flex-shrink-0">{formatPrice(s.soldPrice)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs italic">No players acquired yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
