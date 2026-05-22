/**
 * Extrait une "spec d'export" structurée à partir du DOM d'un onglet :
 *  - KPI cards : data structurées (label/value/sub/color)
 *  - Charts    : titre + type normalisé + data extraite du Chart.js instance + image HD
 *
 * Les composables d'export décident ensuite si chaque chart est rendu en natif
 * (PPTX) ou en image (PDF, PPTX fallback).
 */

import { chartToHighDpiImage, getChartFromCanvas } from "./renderChartHD.js";

const COLOR_CLASSES = {
  blue: "1E4E66",
  green: "30DD92",
  orange: "FFA600",
  red: "E53935",
  purple: "6F45FF",
};

function getColorFromCardClass(card) {
  for (const klass of Object.keys(COLOR_CLASSES)) {
    if (card.classList.contains(klass)) return COLOR_CLASSES[klass];
  }
  return "9CA3AF";
}

function extractKpiCards(kpiGridEl) {
  const cards = [];
  for (const card of kpiGridEl.querySelectorAll(".kpi-card")) {
    const label = card.querySelector(".kpi-label")?.textContent?.trim() || "";
    const value = card.querySelector(".kpi-value")?.textContent?.trim() || "";
    const sub = card.querySelector(".kpi-sub")?.textContent?.trim() || "";
    cards.push({ label, value, sub, color: getColorFromCardClass(card) });
  }
  return cards;
}

/**
 * Récupère la couleur d'un span .kpi-dot via son style inline `background: #...`
 */
function getDotColor(dotEl, fallback = "9CA3AF") {
  if (!dotEl) return fallback;
  // style.backgroundColor est normalisé par le navigateur en "rgb(...)"
  // style.background peut être "#27CE71" tel que Vue l'a posé
  const bg =
    dotEl.style?.backgroundColor ||
    dotEl.style?.background ||
    getComputedStyle(dotEl).backgroundColor ||
    "";
  return colorToHex(bg, fallback) || fallback;
}

/**
 * Extracteur dédié à .kpi-compare-grid (Comparatif).
 * Nouvelle structure : .kpi-line = 3 colonnes (A | delta | B), chaque side a
 * un header (dot + name), une value, et un sub. Le delta chip a une classe
 * --good / --bad / --neutral qu'on capture pour pouvoir colorer dans l'export.
 *
 * Retourne : [{
 *   label,
 *   rows: [
 *     { name, value, sub, color },   // current event
 *     { name, value, sub, color },   // compare event
 *   ],
 *   delta: { text, kind: "good"|"bad"|"neutral" } | null,
 * }]
 */
function extractKpiCompareCards(gridEl) {
  const cards = [];
  for (const card of gridEl.querySelectorAll(".kpi-compare-card")) {
    const label = card.querySelector(".kpi-label")?.textContent?.trim() || "";
    const sides = [...card.querySelectorAll(".kpi-side")];
    const rows = sides.map((side) => ({
      name: side.querySelector(".kpi-side-name")?.textContent?.trim() || "",
      value: side.querySelector(".kpi-side-value")?.textContent?.trim() || "",
      sub: side.querySelector(".kpi-side-sub")?.textContent?.trim() || "",
      color: getDotColor(side.querySelector(".kpi-dot")),
    }));

    const deltaEl = card.querySelector(".kpi-delta");
    let delta = null;
    if (deltaEl) {
      const text = deltaEl.textContent?.trim() || "";
      let kind = "neutral";
      if (deltaEl.classList.contains("kpi-delta--good")) kind = "good";
      else if (deltaEl.classList.contains("kpi-delta--bad")) kind = "bad";
      delta = { text, kind };
    }

    cards.push({ label, rows, delta });
  }
  return cards;
}

function normalizeChartType(chart) {
  const t = chart.config.type;
  if (t === "bar") {
    if (chart.options?.indexAxis === "y") return "horizontalBar";
    const scales = chart.options?.scales || {};
    const stackedX = scales.x?.stacked;
    const stackedY = scales.y?.stacked;
    if (stackedX || stackedY) return "stackedBar";
    return "bar";
  }
  if (t === "line") return "line";
  if (t === "doughnut") return "doughnut";
  if (t === "pie") return "pie";
  if (t === "choropleth") return "choropleth";
  return "unknown";
}

/**
 * Convertit n'importe quelle représentation de couleur Chart.js en hex 6-char.
 * Gère : "#RGB", "#RRGGBB", "#RRGGBBAA" (strip alpha), "rgb(r,g,b)", "rgba(r,g,b,a)".
 */
function colorToHex(color, fallback = null) {
  if (color == null) return fallback;
  if (typeof color === "string") {
    if (color.startsWith("#")) {
      const clean = color.slice(1).toUpperCase();
      if (clean.length === 8) return clean.slice(0, 6); // strip alpha
      if (clean.length === 6) return clean;
      if (clean.length === 3) return clean.split("").map((c) => c + c).join("");
      return fallback;
    }
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
      if (parts.length >= 3) {
        const [r, g, b] = parts;
        return [r, g, b]
          .map((c) => Math.round(c).toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      }
    }
    return fallback;
  }
  if (Array.isArray(color)) return colorToHex(color[0], fallback);
  return fallback;
}

/**
 * Évalue une valeur de couleur Chart.js (string, array, ou fonction de contexte).
 */
function evalColor(source, ctx) {
  if (typeof source === "function") {
    try { return source(ctx); } catch { return null; }
  }
  return source;
}

function extractDatasets(chart) {
  const data = chart.data;
  if (!data) return { labels: [], datasets: [], hasPerPointColors: false };
  const chartType = chart.config.type;
  const labels = (data.labels || []).map((l) => String(l));

  let hasPerPointColors = false;

  const datasets = (data.datasets || []).map((ds, dsIdx) => {
    const values = (ds.data || []).map((v) =>
      typeof v === "number" ? v : Number(v) || 0
    );

    // Priorité de couleur par type de chart :
    //   - line  → borderColor (couleur du trait)
    //   - bar / doughnut / pie / area → backgroundColor (couleur de remplissage)
    const primary = chartType === "line" ? ds.borderColor : ds.backgroundColor;
    const fallbackSrc = chartType === "line" ? ds.backgroundColor : ds.borderColor;

    let perPointColors = null;
    let baseColor = null;

    if (Array.isArray(primary)) {
      // Ex: doughnut → 1 couleur par segment
      perPointColors = primary
        .map((c) => colorToHex(c, null))
        .filter(Boolean);
      baseColor = perPointColors[0] || colorToHex(fallbackSrc, "1E4E66");
      if (perPointColors.length > 1) hasPerPointColors = true;
    } else if (typeof primary === "function") {
      // Ex: bar 15min → couleur calculée par valeur
      perPointColors = values.map((v, i) => {
        const ctx = { raw: v, dataIndex: i, dataset: ds, datasetIndex: dsIdx };
        const c = evalColor(primary, ctx);
        return colorToHex(c, "1E4E66");
      });
      baseColor = perPointColors[0] || "1E4E66";
      // Considérer "per-point" seulement si au moins 2 couleurs différentes
      const uniq = new Set(perPointColors);
      if (uniq.size > 1) hasPerPointColors = true;
    } else {
      baseColor =
        colorToHex(primary, null) ||
        colorToHex(fallbackSrc, null) ||
        "1E4E66";
    }

    return {
      label: ds.label || "",
      values,
      color: baseColor,
      colors: perPointColors,
    };
  });

  return { labels, datasets, hasPerPointColors };
}

async function captureChartCardImage(card, html2canvas) {
  if (!html2canvas || !card) return null;
  // Masquer boutons CSV / sélecteurs pendant la capture
  const hide = [
    ".csv-btn",
    ".period-selector",
    ".chart-hint",
    ".badge-type-filter",
  ];
  const hidden = [];
  for (const sel of hide) {
    for (const node of card.querySelectorAll(sel)) {
      hidden.push([node, node.style.visibility]);
      node.style.visibility = "hidden";
    }
  }
  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } finally {
    for (const [node, prev] of hidden) node.style.visibility = prev || "";
  }
}

async function extractChartCard(card, { html2canvas } = {}) {
  const title = card.querySelector("h3")?.textContent?.trim() || "";
  const canvas = card.querySelector("canvas");
  const chart = getChartFromCanvas(canvas);

  const captionEl = card.querySelector(".perf-summary");
  const caption = captionEl ? captionEl.innerText.replace(/\s+/g, " ").trim() : null;

  // Detection des cartes "complexes" qui ne se re-rendent pas bien en HD :
  // - choropleth (chartjs-chart-geo : depend de GeoJSON fetche async)
  // - cartes avec legende custom HTML sous le canvas (mini-DOM, region legend)
  // - barres HTML pures (progress bar) sans Chart.js
  // -> on capture le chart-card entier en image via html2canvas.
  const hasGeoLegend = !!card.querySelector(".map-legend, .dom-row, .dom-card");
  const isChoropleth = chart?.config?.type === "choropleth";
  const forceCardCapture = !chart || hasGeoLegend || isChoropleth;

  if (forceCardCapture) {
    const image = await captureChartCardImage(card, html2canvas);
    return {
      type: "chart",
      title,
      chartType: isChoropleth ? "map" : "html",
      data: { labels: [], datasets: [], hasPerPointColors: false },
      image,
      caption,
    };
  }

  const chartType = normalizeChartType(chart);
  const data = extractDatasets(chart);
  const image = await chartToHighDpiImage(chart, { width: 1600, height: 900 });

  return {
    type: "chart",
    title,
    chartType,
    data,
    image,
    caption,
    sourceOptions: chart.config.options,
  };
}

function findContentRoot(tabEl) {
  const candidates = [tabEl, ...tabEl.querySelectorAll("div")];
  for (const node of candidates) {
    for (const c of node.children) {
      if (
        c.classList?.contains("kpi-grid") ||
        c.classList?.contains("chart-card") ||
        c.classList?.contains("charts-row") ||
        c.classList?.contains("table-container") ||
        c.classList?.contains("kpi-compare-grid")
      ) {
        return node;
      }
    }
  }
  return tabEl;
}

/**
 * Walk un onglet et retourne une liste de "blocks" prêts à exporter.
 */
export async function extractTabSpec(tabEl, { html2canvas } = {}) {
  const blocks = [];
  if (!tabEl) return blocks;

  const root = findContentRoot(tabEl);
  for (const child of root.children) {
    if (!(child instanceof HTMLElement)) continue;

    if (child.classList.contains("kpi-compare-grid")) {
      blocks.push({
        type: "kpi-compare-grid",
        cards: extractKpiCompareCards(child),
      });
    } else if (child.classList.contains("kpi-grid")) {
      blocks.push({ type: "kpi-grid", kpis: extractKpiCards(child) });
    } else if (child.classList.contains("chart-card")) {
      blocks.push(await extractChartCard(child, { html2canvas }));
    } else if (child.classList.contains("charts-row")) {
      const charts = [];
      for (const card of child.children) {
        if (card.classList.contains("chart-card")) {
          charts.push(await extractChartCard(card, { html2canvas }));
        }
      }
      blocks.push({ type: "chart-row", charts });
    } else if (child.classList.contains("table-container")) {
      blocks.push({
        type: "note",
        text: "Données détaillées des inscrits — voir export CSV depuis l'onglet Données.",
      });
    }
  }
  return blocks;
}
