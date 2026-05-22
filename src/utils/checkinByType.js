// Helpers partages pour le graphique "Progression du check-in par type" :
// bar horizontale stacked par type de badge (check-in colore / restants estompes).
// Utilise sur ComparisonTab + BadgesTab.

import { getTypeColor } from "./typeColors.js";

// Determine le type "attendu" d'un delegate :
//   1. 1er badge en base (peu importe deliveredAt — le badge entry est cree
//      des la registration, on connait donc le type meme avant le check-in)
//   2. fallback : 1ere registration
//   3. "Inconnu"
export function delegateBadgeType(d) {
  if (d?.badges && d.badges.length > 0) {
    return d.badges[0].type || "Inconnu";
  }
  if (d?.registrations && d.registrations.length > 0) {
    return d.registrations[0].type || "Inconnu";
  }
  return "Inconnu";
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#") return `rgba(229,231,235,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Construit le chartData + meta pour la bar horizontale stacked.
// delegates : liste filtree (page-level + cross-filters)
// Pour chaque type :
//   - expected = count registered avec ce type
//   - checkedIn = count registered avec ce type ET checkedInDate
export function buildCheckinByType(delegates) {
  if (!delegates || delegates.length === 0) {
    return { labels: [], chartData: { labels: [], datasets: [] }, height: 200 };
  }

  const expected = new Map();
  const checkedIn = new Map();
  for (const d of delegates) {
    if (d.status?.toLowerCase() !== "registered") continue;
    const type = delegateBadgeType(d);
    expected.set(type, (expected.get(type) || 0) + 1);
    if (d.checkedInDate) checkedIn.set(type, (checkedIn.get(type) || 0) + 1);
  }
  if (expected.size === 0) {
    return { labels: [], chartData: { labels: [], datasets: [] }, height: 200 };
  }

  // Top N + agregation "Autres"
  const MAX_TYPES = 10;
  const sorted = [...expected.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MAX_TYPES);
  const rest = sorted.slice(MAX_TYPES);
  const labels = top.map(([t]) => t);
  const checkinData = top.map(([t]) => checkedIn.get(t) || 0);
  const remainingData = top.map(([t, exp]) => exp - (checkedIn.get(t) || 0));
  if (rest.length > 0) {
    labels.push("Autres");
    const restExp = rest.reduce((s, [, n]) => s + n, 0);
    const restCi = rest.reduce((s, [t]) => s + (checkedIn.get(t) || 0), 0);
    checkinData.push(restCi);
    remainingData.push(restExp - restCi);
  }

  // Couleurs par type. Restants = meme teinte mais alpha 0.15.
  const checkinColors = labels.map((t) => (t === "Autres" ? "#9CA3AF" : getTypeColor(t)));
  const remainingColors = checkinColors.map((c) => hexToRgba(c, 0.15));

  return {
    labels,
    height: Math.max(220, labels.length * 36 + 60),
    chartData: {
      labels,
      datasets: [
        {
          label: "Check-in",
          data: checkinData,
          backgroundColor: checkinColors,
          borderWidth: 0,
          barThickness: 22,
        },
        {
          label: "Restants",
          data: remainingData,
          backgroundColor: remainingColors,
          borderWidth: 0,
          barThickness: 22,
        },
      ],
    },
  };
}

// Plugin Chart.js qui ecrit "X / Y (Z%)" en bout de barre.
// On contourne chartjs-plugin-datalabels dont le default global est display:false.
export const checkinByTypeTotalsPlugin = {
  id: "checkinByTypeTotals",
  afterDatasetsDraw(chart) {
    const { ctx, data, scales, chartArea } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    if (!xScale || !yScale || data.labels.length === 0) return;

    ctx.save();
    ctx.fillStyle = "#414141";
    ctx.font = "600 11px Poppins, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let i = 0; i < data.labels.length; i++) {
      const ci = data.datasets[0]?.data[i] || 0;
      const rest = data.datasets[1]?.data[i] || 0;
      const total = ci + rest;
      if (total === 0) continue;
      const pctVal = ((ci / total) * 100).toFixed(0);
      const text = `${ci} / ${total} (${pctVal}%)`;
      const x = Math.min(xScale.getPixelForValue(total) + 6, chartArea.right + 60);
      const y = yScale.getPixelForValue(i);
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  },
};

export const checkinByTypeOptions = {
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} : ${ctx.raw}`,
      },
    },
  },
  layout: { padding: { right: 76, top: 4, bottom: 4 } },
  scales: {
    x: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
    y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
  },
};
