import { getTodayIso } from "./raw-core.js";

export function recordOutcome(experiments, post, outcome, reason = null) {
  const entry = {
    date: getTodayIso(),
    post_date: post.date,
    angle_id: post.angle_id,
    type: post.type,
    pillar:
      post.type === "craft-tip"
        ? "craft"
        : post.type === "philosophy"
          ? "philosophy"
          : "conversion",
    content_origin: post.content_origin || "system",
    panel_score: post.panel_score ?? null,
    outcome,
    reason: reason || null,
    recorded_at: new Date().toISOString()
  };

  return {
    updated_at: new Date().toISOString(),
    outcomes: [...(experiments.outcomes || []), entry]
  };
}

function rate(approved, total) {
  if (total === 0) return "n/a";
  return `${Math.round((approved / total) * 100)}% (${approved}/${total})`;
}

function groupBy(outcomes, key) {
  const groups = {};
  for (const outcome of outcomes) {
    const value = outcome[key] || "unknown";
    if (!groups[value]) {
      groups[value] = { approved: 0, total: 0 };
    }
    groups[value].total += 1;
    if (outcome.outcome === "approved") {
      groups[value].approved += 1;
    }
  }
  return groups;
}

function topRejectionReasons(outcomes) {
  const counts = {};
  for (const outcome of outcomes) {
    if (outcome.outcome === "rejected" && outcome.reason) {
      counts[outcome.reason] = (counts[outcome.reason] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function bestPerformingAngle(outcomes) {
  const stats = {};
  for (const outcome of outcomes) {
    const id = outcome.angle_id;
    if (!id) continue;
    if (!stats[id]) stats[id] = { approved: 0, total: 0 };
    stats[id].total += 1;
    if (outcome.outcome === "approved") stats[id].approved += 1;
  }

  return Object.entries(stats)
    .filter(([, s]) => s.total >= 2)
    .sort((left, right) => {
      const rateLeft = left[1].approved / left[1].total;
      const rateRight = right[1].approved / right[1].total;
      return rateRight - rateLeft || right[1].total - left[1].total;
    })
    .slice(0, 3)
    .map(([id, s]) => `${id}: ${rate(s.approved, s.total)}`);
}

export function buildScorecard(experiments, windowDays = 28) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const outcomes = (experiments.outcomes || []).filter(
    (outcome) => new Date(outcome.recorded_at) >= cutoff
  );

  if (!outcomes.length) {
    return `RAW Growth Scorecard — no outcomes recorded in the last ${windowDays} days.\n\nApprove or reject posts via /review to start tracking.`;
  }

  const byPillar = groupBy(outcomes, "pillar");
  const byType = groupBy(outcomes, "type");
  const byOrigin = groupBy(outcomes, "content_origin");
  const reasons = topRejectionReasons(outcomes);
  const best = bestPerformingAngle(outcomes);

  const totalApproved = outcomes.filter((o) => o.outcome === "approved").length;
  const lines = [
    `RAW Growth Scorecard — last ${windowDays} days`,
    `Total posts reviewed: ${outcomes.length} | Approved: ${totalApproved}`,
    "",
    "By pillar:",
    ...Object.entries(byPillar).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    ),
    "",
    "By template type:",
    ...Object.entries(byType).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    ),
    "",
    "By content origin:",
    ...Object.entries(byOrigin).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    )
  ];

  if (reasons.length) {
    lines.push("", "Top rejection reasons:");
    lines.push(...reasons.map(([reason, count]) => `  ${reason}: ${count}`));
  }

  if (best.length) {
    lines.push("", "Best-performing angles:");
    lines.push(...best.map((entry) => `  ${entry}`));
  }

  return lines.join("\n");
}
