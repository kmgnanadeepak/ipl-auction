import React from 'react';
const LoadingScreen = () => (
  <div className="min-h-screen bg-ipl-dark flex items-center justify-center">
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-yellow-500/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-500 animate-spin" />
        <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
      </div>
      <h2 className="text-2xl font-display font-bold gradient-text">IPL AUCTION</h2>
      <p className="text-gray-500 text-sm mt-1 font-body">Loading…</p>
    </div>
  </div>
);
export default LoadingScreen;
