import React from 'react';

export default function BudgetAlertBanner({ alert }) {
  if (!alert) return null;
  const styles =
    alert.level === 'critical'
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200';

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className="text-sm font-semibold">
        {alert.level === 'critical' ? 'Critical Budget Alert' : 'Budget Warning'}
      </p>
      <p className="text-xs opacity-90 mt-1">{alert.message}</p>
      <p className="text-xs mt-1">Remaining: {alert.percent}%</p>
    </div>
  );
}
