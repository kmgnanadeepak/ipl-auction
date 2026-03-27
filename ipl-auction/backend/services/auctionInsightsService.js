function calculateRemainingBudget(totalBudget, spentAmount) {
  const total = Number(totalBudget || 0);
  const spent = Number(spentAmount || 0);
  return Math.max(0, total - spent);
}

function getBudgetAlert(totalBudget, remainingBudget) {
  const total = Number(totalBudget || 0);
  const remaining = Number(remainingBudget || 0);
  if (total <= 0) return null;
  const percent = (remaining / total) * 100;
  if (percent < 10) {
    return {
      level: 'critical',
      color: 'red',
      percent: Number(percent.toFixed(1)),
      message: 'Critical: less than 10% budget left.',
    };
  }
  if (percent < 25) {
    return {
      level: 'warning',
      color: 'yellow',
      percent: Number(percent.toFixed(1)),
      message: 'Warning: less than 25% budget left.',
    };
  }
  return null;
}

function getTeamSpendData(participants = []) {
  return participants.map((team) => {
    const totalBudget = Number(team.budget || 0);
    const remainingBudget = Number(team.remainingBudget || 0);
    const spent = Math.max(0, totalBudget - remainingBudget);
    return {
      sessionId: team.sessionId,
      teamName: team.teamName,
      color: team.color,
      spent,
      totalBudget,
      remainingBudget,
      utilizationPercent: totalBudget > 0 ? Number(((spent / totalBudget) * 100).toFixed(1)) : 0,
    };
  });
}

function getRoleBreakdownFromSquad(squad = []) {
  return squad.reduce(
    (acc, player) => {
      const role = player?.role;
      if (role === 'Batsman') acc.batsman += 1;
      if (role === 'Bowler') acc.bowler += 1;
      if (role === 'All-rounder') acc.allRounder += 1;
      if (role === 'Wicketkeeper') acc.wicketkeeper += 1;
      return acc;
    },
    { batsman: 0, bowler: 0, allRounder: 0, wicketkeeper: 0 }
  );
}

function getSuggestion(team, budget) {
  const remainingBudget = Number(budget?.remainingBudget ?? team?.remainingBudget ?? 0);
  const totalBudget = Number(budget?.totalBudget ?? team?.budget ?? 0);
  const remainingPercent = totalBudget > 0 ? (remainingBudget / totalBudget) * 100 : 0;
  const squad = Array.isArray(team?.squad) ? team.squad : [];
  const roleCount = getRoleBreakdownFromSquad(squad);
  const totalPlayers = squad.length;

  const roleTargets = {
    batsman: 4,
    bowler: 4,
    allRounder: 3,
    wicketkeeper: 2,
  };

  const shortages = [
    { role: 'Batsman', gap: roleTargets.batsman - roleCount.batsman },
    { role: 'Bowler', gap: roleTargets.bowler - roleCount.bowler },
    { role: 'All-rounder', gap: roleTargets.allRounder - roleCount.allRounder },
    { role: 'Wicketkeeper', gap: roleTargets.wicketkeeper - roleCount.wicketkeeper },
  ].sort((a, b) => b.gap - a.gap);

  const topNeed = shortages[0];
  const nextRole = topNeed.gap > 0 ? topNeed.role : 'Best available';

  let budgetStrategy = 'Balanced approach: stay flexible for marquee players.';
  let maxBidRecommendation = Math.max(20, Math.floor(remainingBudget * 0.18));

  if (remainingPercent < 10) {
    budgetStrategy = 'Defensive strategy: bid only for high-need roles and undervalued players.';
    maxBidRecommendation = Math.max(10, Math.floor(remainingBudget * 0.08));
  } else if (remainingPercent < 25) {
    budgetStrategy = 'Conservative strategy: prioritize role gaps and avoid bidding wars.';
    maxBidRecommendation = Math.max(15, Math.floor(remainingBudget * 0.12));
  } else if (totalPlayers < 5) {
    budgetStrategy = 'Aggressive strategy: secure core players early while budget is healthy.';
    maxBidRecommendation = Math.max(25, Math.floor(remainingBudget * 0.22));
  }

  return {
    nextPlayerRole: nextRole,
    budgetStrategy,
    maxBidRecommendation,
    roleBreakdown: roleCount,
    remainingBudget,
    remainingPercent: Number(remainingPercent.toFixed(1)),
  };
}

module.exports = {
  calculateRemainingBudget,
  getBudgetAlert,
  getTeamSpendData,
  getSuggestion,
};
