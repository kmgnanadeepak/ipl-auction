import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { formatPrice } from '../utils/api';
import { ArrowLeft, Trophy, Download } from 'lucide-react';

const medalByRank = ['🥇', '🥈', '🥉'];

export default function ResultsPage() {
  const { room, auctionState, auctionResults } = useRoom();
  if (!room) return null;

  const results = auctionResults || room?.auction?.results || null;
  const status = auctionState?.status || room?.auction?.status;
  if (status !== 'completed') return <Navigate to="/auction" replace />;
  if (!results?.rankings?.length) {
    return (
      <div className="min-h-screen bg-ipl-dark flex items-center justify-center text-gray-400">
        Results are being prepared...
      </div>
    );
  }

  const downloadFile = (name, mime, content) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    downloadFile(
      `auction-results-${room.roomCode}.json`,
      'application/json;charset=utf-8',
      JSON.stringify(results, null, 2)
    );
  };

  const exportCsv = () => {
    const rows = [
      ['Rank', 'Team', 'Score', 'BaseScore', 'RoleBonus', 'TotalSpent(L)', 'RemainingBudget(L)', 'PlayerCount'],
      ...results.rankings.map((t, i) => [
        i + 1,
        t.teamName,
        t.score,
        t.baseScore ?? '',
        t.roleBalanceBonus ?? '',
        t.totalSpent,
        t.remainingBudget,
        (t.players || []).length,
      ]),
      [],
      ['Steals (Top 5)'],
      ['Player', 'Team', 'Role', 'SoldPrice(L)', 'MarketValue(L)', 'ValueDiff(L)'],
      ...((results.insights?.steals || []).map((s) => [s.playerName, s.teamName, s.role, s.soldPrice, s.marketValue, s.valueDiff])),
      [],
      ['Overpays (Top 5)'],
      ['Player', 'Team', 'Role', 'SoldPrice(L)', 'MarketValue(L)', 'ValueDiff(L)'],
      ...((results.insights?.overpays || []).map((s) => [s.playerName, s.teamName, s.role, s.soldPrice, s.marketValue, s.valueDiff])),
      [],
      ['Players'],
      ['Team', 'Player', 'Role', 'IPL Team', 'Price(L)', 'Rating', 'SR', 'AVG', 'Eco'],
      ...results.rankings.flatMap((t) =>
        (t.players || []).map((pl) => [
          t.teamName,
          pl.name,
          pl.role,
          pl.iplTeam || 'Did Not Play',
          pl.soldPrice,
          pl.rating,
          pl.stats?.strikeRate ?? 0,
          pl.stats?.average ?? 0,
          pl.stats?.economy ?? 0,
        ])
      ),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadFile(`auction-results-${room.roomCode}.csv`, 'text/csv;charset=utf-8', csv);
  };

  return (
    <div className="min-h-screen bg-ipl-dark">
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/auction" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-display font-bold text-white text-xl">Auction Results</h1>
          <span className="text-gray-500 text-sm">{room.roomName}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportJson} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 text-xs font-semibold flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 text-xs font-semibold flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider">Winner</p>
            <p className="text-yellow-400 font-display font-bold text-lg mt-1">{results.winner?.teamName || '—'}</p>
            <p className="text-gray-400 text-sm">Score: {results.winner?.score ?? 0}</p>
          </div>
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider">Runner-up</p>
            <p className="text-white font-display font-bold text-lg mt-1">{results.runnerUp?.teamName || '—'}</p>
            <p className="text-gray-400 text-sm">Score: {results.runnerUp?.score ?? 0}</p>
          </div>
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider">Third Place</p>
            <p className="text-white font-display font-bold text-lg mt-1">{results.thirdPlace?.teamName || '—'}</p>
            <p className="text-gray-400 text-sm">Score: {results.thirdPlace?.score ?? 0}</p>
          </div>
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider">Most Expensive</p>
            <p className="text-green-400 font-display font-bold text-lg mt-1">{results.mostExpensivePlayer?.name || '—'}</p>
            <p className="text-gray-400 text-sm">{formatPrice(results.mostExpensivePlayer?.soldPrice)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Top 5 Steals</p>
            <div className="space-y-2">
              {(results.insights?.steals || []).map((s, i) => (
                <div key={`${s.playerName}-${i}`} className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{s.playerName} <span className="text-gray-500">({s.teamName})</span></p>
                    <p className="text-xs text-gray-500">{s.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-400 font-bold">{formatPrice(s.soldPrice)}</p>
                    <p className="text-[11px] text-green-300">-{formatPrice(Math.abs(s.valueDiff))} vs value</p>
                  </div>
                </div>
              ))}
              {(results.insights?.steals || []).length === 0 && <p className="text-xs text-gray-600 italic">No steals data available</p>}
            </div>
          </div>
          <div className="ipl-card p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Top 5 Overpays</p>
            <div className="space-y-2">
              {(results.insights?.overpays || []).map((s, i) => (
                <div key={`${s.playerName}-${i}`} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{s.playerName} <span className="text-gray-500">({s.teamName})</span></p>
                    <p className="text-xs text-gray-500">{s.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-red-400 font-bold">{formatPrice(s.soldPrice)}</p>
                    <p className="text-[11px] text-red-300">+{formatPrice(Math.abs(s.valueDiff))} vs value</p>
                  </div>
                </div>
              ))}
              {(results.insights?.overpays || []).length === 0 && <p className="text-xs text-gray-600 italic">No overpay data available</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {results.rankings.map((team, idx) => (
            <div key={team.sessionId || team.teamName} className="ipl-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{medalByRank[idx] || <Trophy className="w-4 h-4 text-gray-500" />}</span>
                  <h3 className="font-display font-bold text-white text-lg">{team.teamName}</h3>
                </div>
                <span className="text-yellow-400 font-display font-bold">#{idx + 1}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                  <p className="text-gray-500 text-xs">Score</p>
                  <p className="text-white font-display font-bold">{team.score}</p>
                </div>
                <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                  <p className="text-gray-500 text-xs">Spent</p>
                  <p className="text-red-400 font-display font-bold">{formatPrice(team.totalSpent)}</p>
                </div>
                <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                  <p className="text-gray-500 text-xs">Remaining</p>
                  <p className="text-green-400 font-display font-bold">{formatPrice(team.remainingBudget)}</p>
                </div>
              </div>
              <div className="mb-3 text-xs text-gray-400">
                Base score: <span className="text-white font-semibold">{team.baseScore ?? team.score}</span>
                {' '}+ Role balance bonus: <span className="text-yellow-400 font-semibold">{team.roleBalanceBonus ?? 0}</span>
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {team.players?.length ? team.players.map((pl) => (
                  <div key={`${team.sessionId}-${pl._id}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-800/40 border border-gray-700/60">
                    <div>
                      <p className="text-sm text-white">{pl.name} <span className="text-gray-400">({pl.iplTeam || 'Did Not Play'})</span></p>
                      <p className="text-xs text-gray-500">
                        {pl.role} · SR {pl.stats?.strikeRate ?? 0} · AVG {pl.stats?.average ?? 0} · Eco {pl.stats?.economy ?? 0}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-400 font-bold">{formatPrice(pl.soldPrice)}</p>
                      <p className="text-[11px] text-yellow-400">Rating {pl.rating}</p>
                    </div>
                  </div>
                )) : <p className="text-xs text-gray-600 italic">No players acquired</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
