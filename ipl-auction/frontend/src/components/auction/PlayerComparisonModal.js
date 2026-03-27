import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { formatPrice } from '../../utils/api';

function getMetric(player, key) {
  const s = player?.stats || {};
  if (key === 'strikeRate') return Number(s.strikeRate ?? s.sr ?? 0);
  if (key === 'average') return Number(s.average ?? s.avg ?? 0);
  if (key === 'price') return Number(player?.soldPrice ?? player?.basePrice ?? 0);
  return 0;
}

export default function PlayerComparisonModal({ open, onClose, leftPlayer, rightPlayer }) {
  const chartData = useMemo(() => {
    if (!leftPlayer || !rightPlayer) return [];
    return [
      { metric: 'Strike Rate', [leftPlayer.name]: getMetric(leftPlayer, 'strikeRate'), [rightPlayer.name]: getMetric(rightPlayer, 'strikeRate') },
      { metric: 'Average', [leftPlayer.name]: getMetric(leftPlayer, 'average'), [rightPlayer.name]: getMetric(rightPlayer, 'average') },
      { metric: 'Price', [leftPlayer.name]: getMetric(leftPlayer, 'price'), [rightPlayer.name]: getMetric(rightPlayer, 'price') },
    ];
  }, [leftPlayer, rightPlayer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-white font-bold">Player Comparison</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[leftPlayer, rightPlayer].map((p) => (
            <div key={p?._id} className="rounded-xl border border-gray-800 bg-gray-800/40 p-3">
              <p className="text-white font-semibold">{p?.name}</p>
              <p className="text-xs text-gray-400">{p?.role} · {p?.iplTeam || 'Did Not Play'}</p>
              <div className="mt-3 text-xs text-gray-300 space-y-1">
                <p>Strike Rate: {getMetric(p, 'strikeRate')}</p>
                <p>Average: {getMetric(p, 'average')}</p>
                <p>Base Price: {formatPrice(p?.basePrice)}</p>
                <p>Sold Price: {p?.soldPrice != null ? formatPrice(p.soldPrice) : 'Not sold'}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="h-72 px-5 pb-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="metric" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Legend />
              <Bar dataKey={leftPlayer?.name} fill="#FBBF24" radius={[6, 6, 0, 0]} />
              <Bar dataKey={rightPlayer?.name} fill="#60A5FA" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
