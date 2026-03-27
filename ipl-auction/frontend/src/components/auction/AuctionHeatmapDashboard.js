import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatPrice } from '../../utils/api';

export default function AuctionHeatmapDashboard({ spendData = [] }) {
  return (
    <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Auction Heatmap Dashboard</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="teamName" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip formatter={(value) => formatPrice(value)} />
            <Bar dataKey="spent" fill="#F59E0B" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
