import React from 'react';
import { Sparkles } from 'lucide-react';
import { formatPrice } from '../../utils/api';

export default function AISuggestionCard({ suggestion, loading }) {
  return (
    <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">AI Suggestion</h3>
      </div>
      {loading ? (
        <p className="text-xs text-gray-500">Analyzing squad and budget...</p>
      ) : !suggestion ? (
        <p className="text-xs text-gray-500">No suggestion yet.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-gray-300">
            <span className="text-gray-500">Next role:</span> <span className="text-white font-semibold">{suggestion.nextPlayerRole}</span>
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">Budget plan:</span> {suggestion.budgetStrategy}
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">Recommended max bid:</span>{' '}
            <span className="text-green-400 font-semibold">{formatPrice(suggestion.maxBidRecommendation)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
