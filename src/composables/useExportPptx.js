import { ref } from "vue";
import { generateAnalysis } from "../utils/generateAnalysis.js";
import { extractTabSpec } from "../utils/exportSpec.js";

// Couleurs CYIM (sans #)
const PRIMARY = "1E4E66";
const ACCENT = "30DD92";
const PURPLE = "6F45FF";
const TEXT = "414141";
const TEXT_SEC = "646464";
const BG = "F5F6FA";
const FONT = "Poppins";

// Dimensions slide LAYOUT_WIDE (pouces)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const HEADER_H = 0.6;
const MARGIN = 0.3;
const FOOTER_Y = SLIDE_H - 0.35;
const CONTENT_Y = HEADER_H + 0.2;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_H = FOOTER_Y - CONTENT_Y - 0.1;

function addHeader(pptx, slide, label, sub) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
    fill: { color: PRIMARY }, line: { color: PRIMARY },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: HEADER_H, w: SLIDE_W, h: 0.05,
    fill: { color: ACCENT }, line: { color: ACCENT },
  });
  slide.addText(label, {
    x: 0.35, y: 0.05, w: 9, h: HEADER_H - 0.1,
    fontSize: 16, fontFace: FONT, color: "FFFFFF", bold: true,
    valign: "middle",
  });
  if (sub) {
    slide.addText(sub, {
      x: 9.4, y: 0.05, w: 3.6, h: HEADER_H - 0.1,
      fontSize: 10, fontFace: FONT, color: "BBDDEE",
      valign: "middle", align: "right",
    });
  }
}

function addFooter(pptx, slide, leftText, pageInfo) {
  slide.addText(leftText || "", {
    x: 0.3, y: FOOTER_Y, w: 8, h: 0.25,
    fontSize: 8, fontFace: FONT, color: TEXT_SEC,
  });
  slide.addText(pageInfo || "CYIM Statistics", {
    x: SLIDE_W - 4, y: FOOTER_Y, w: 3.7, h: 0.25,
    fontSize: 8, fontFace: FONT, color: TEXT_SEC, align: "right",
  });
}

function addCoverSlide(pptx, eventName, totalCount, date) {
  const slide = pptx.addSlide();
  slide.background = { color: PRIMARY };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.25, h: SLIDE_H,
    fill: { color: ACCENT }, line: { color: ACCENT },
  });
  slide.addText("CYIM • STATISTICS", {
    x: 0.8, y: 2.2, w: 12, h: 0.4,
    fontSize: 12, fontFace: FONT, color: ACCENT, bold: true, charSpacing: 4,
  });
  slide.addText(eventName || "Statistiques événement", {
    x: 0.8, y: 2.7, w: 12, h: 1.3,
    fontSize: 38, fontFace: FONT, color: "FFFFFF", bold: true,
  });
  slide.addText("Dashboard Registration", {
    x: 0.8, y: 4.05, w: 12, h: 0.5,
    fontSize: 16, fontFace: FONT, color: "BBDDEE",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 5.1, w: 4.5, h: 1.3,
    fill: { color: "FFFFFF", transparency: 88 },
    line: { color: ACCENT, width: 1 },
  });
  slide.addText(`${(totalCount || 0).toLocaleString("fr-FR")}`, {
    x: 0.9, y: 5.2, w: 4.3, h: 0.8,
    fontSize: 32, fontFace: FONT, color: "FFFFFF", bold: true,
  });
  slide.addText("inscrits", {
    x: 0.9, y: 5.9, w: 4.3, h: 0.3,
    fontSize: 12, fontFace: FONT, color: "BBDDEE",
  });
  slide.addText(date, {
    x: 0.8, y: 6.7, w: 12, h: 0.3,
    fontSize: 11, fontFace: FONT, color: "BBDDEE",
  });
}

function addTabDivider(pptx, tabLabel, eventName) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 3.0, w: SLIDE_W, h: 1.5,
    fill: { color: PRIMARY }, line: { color: PRIMARY },
  });
  slide.addText(tabLabel, {
    x: 0.4, y: 3.1, w: 12.5, h: 1.3,
    fontSize: 32, fontFace: FONT, color: "FFFFFF", bold: true,
    valign: "middle",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4.5, w: SLIDE_W, h: 0.08,
    fill: { color: ACCENT }, line: { color: ACCENT },
  });
  slide.addText(eventName || "", {
    x: 0.4, y: 4.7, w: 12.5, h: 0.4,
    fontSize: 13, fontFace: FONT, color: TEXT_SEC,
  });
}

// Couleurs delta chip (alignees avec le CSS UI .kpi-delta--good/--bad/--neutral)
const DELTA_PPTX = {
  good: { fill: "D1FAE5", text: "047857" },
  bad: { fill: "FEE2E2", text: "B91C1C" },
  neutral: { fill: "F3F4F6", text: "646464" },
};

function addKpiCompareSlide(pptx, cards, tabLabel, eventName) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  addHeader(pptx, slide, tabLabel, "Indicateurs comparés");
  addFooter(pptx, slide, eventName, "");

  const filtered = cards.filter((c) => c.rows && c.rows.length >= 2);
  const n = filtered.length;
  if (n === 0) return;

  // 2 colonnes pour <= 4 cards, 3 colonnes au-dela.
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gap = 0.18;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = Math.min(2.3, (CONTENT_H - gap * (rows - 1)) / rows);
  const startY = CONTENT_Y + (CONTENT_H - cellH * rows - gap * (rows - 1)) / 2;

  filtered.forEach((card, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = startY + r * (cellH + gap);

    // Card background
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: cellW, h: cellH,
      fill: { color: "FFFFFF" },
      line: { color: "E5E7EB", width: 0.5 },
    });

    // Label en uppercase + ligne separatrice
    slide.addText((card.label || "").toUpperCase(), {
      x: x + 0.18, y: y + 0.1, w: cellW - 0.3, h: 0.28,
      fontSize: 9, fontFace: FONT, color: TEXT_SEC, bold: true,
      charSpacing: 1,
    });
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.18, y: y + 0.4, w: cellW - 0.36, h: 0,
      line: { color: "F3F4F6", width: 0.5 },
    });

    // 3 colonnes internes : A | delta | B
    const innerY = y + 0.48;
    const innerH = cellH - 0.55;
    const sideW = (cellW - 0.36) * 0.4;
    const deltaW = (cellW - 0.36) * 0.2;
    const xA = x + 0.18;
    const xDelta = xA + sideW;
    const xB = xDelta + deltaW;

    addCompareSide(slide, pptx, card.rows[0], xA, innerY, sideW, innerH, "left");
    addCompareSide(slide, pptx, card.rows[1], xB, innerY, sideW, innerH, "right");
    addDeltaChip(slide, pptx, card.delta, xDelta, innerY, deltaW, innerH);
  });
}

function addCompareSide(slide, pptx, row, x, y, w, h, align) {
  if (!row) return;
  const isRight = align === "right";
  const dotW = 0.1;
  const dotX = isRight ? x + w - dotW : x;

  slide.addShape(pptx.ShapeType.ellipse, {
    x: dotX, y: y + 0.05, w: dotW, h: dotW,
    fill: { color: row.color || PRIMARY },
    line: { color: row.color || PRIMARY },
  });
  const nameX = isRight ? x : x + dotW + 0.05;
  const nameW = w - dotW - 0.05;
  slide.addText(row.name || "", {
    x: nameX, y: y, w: nameW, h: 0.22,
    fontSize: 8, fontFace: FONT, color: TEXT_SEC,
    valign: "middle", align: isRight ? "right" : "left",
  });

  // Valeur grande
  slide.addText(row.value || "—", {
    x, y: y + 0.28, w, h: 0.55,
    fontSize: 22, fontFace: FONT, color: TEXT, bold: true,
    valign: "top", align: isRight ? "right" : "left",
  });

  // Sub
  if (row.sub) {
    slide.addText(row.sub, {
      x, y: y + 0.85, w, h: 0.3,
      fontSize: 8, fontFace: FONT, color: TEXT_SEC,
      align: isRight ? "right" : "left",
    });
  }
}

function addDeltaChip(slide, pptx, delta, x, y, w, h) {
  if (!delta || !delta.text) return;
  const colors = DELTA_PPTX[delta.kind] || DELTA_PPTX.neutral;
  const chipW = Math.min(w - 0.1, 1.1);
  const chipH = 0.3;
  const cx = x + (w - chipW) / 2;
  const cy = y + h / 2 - chipH / 2;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: cx, y: cy, w: chipW, h: chipH,
    fill: { color: colors.fill },
    line: { color: colors.fill },
    rectRadius: 0.05,
  });
  slide.addText(delta.text, {
    x: cx, y: cy, w: chipW, h: chipH,
    fontSize: 9, fontFace: FONT, color: colors.text, bold: true,
    align: "center", valign: "middle",
  });
}

function addKpiSlide(pptx, kpis, tabLabel, eventName) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  addHeader(pptx, slide, tabLabel, "Indicateurs clés");
  addFooter(pptx, slide, eventName, "");

  // Grille KPI : max 2 lignes × 4 colonnes = 8 cellules
  const filtered = kpis.filter((k) => k.value && k.value !== "");
  const n = filtered.length;
  if (n === 0) return;

  const cols = Math.min(5, n);
  const rows = Math.ceil(n / cols);
  const gap = 0.2;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = Math.min(2.5, (CONTENT_H - gap * (rows - 1)) / rows);
  const startY = CONTENT_Y + (CONTENT_H - cellH * rows - gap * (rows - 1)) / 2;

  filtered.forEach((kpi, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = startY + r * (cellH + gap);

    // Card background
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: cellW, h: cellH,
      fill: { color: "FFFFFF" },
      line: { color: "E5E7EB", width: 0.5 },
    });
    // Color stripe à gauche
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: cellH,
      fill: { color: kpi.color || PRIMARY },
      line: { color: kpi.color || PRIMARY },
    });
    // Label
    slide.addText(kpi.label, {
      x: x + 0.2, y: y + 0.12, w: cellW - 0.3, h: 0.3,
      fontSize: 10, fontFace: FONT, color: TEXT_SEC, bold: true,
    });
    // Value
    slide.addText(kpi.value, {
      x: x + 0.2, y: y + 0.5, w: cellW - 0.3, h: cellH - 0.9,
      fontSize: cellH > 1.5 ? 28 : 22, fontFace: FONT, color: TEXT, bold: true,
      valign: "middle",
    });
    // Sub
    if (kpi.sub) {
      slide.addText(kpi.sub, {
        x: x + 0.2, y: y + cellH - 0.4, w: cellW - 0.3, h: 0.3,
        fontSize: 9, fontFace: FONT, color: TEXT_SEC,
      });
    }
  });
}

// Mapping chartType → pptx native render
function chartTypeSupportsNative(t) {
  return ["bar", "horizontalBar", "stackedBar", "line", "doughnut", "pie"].includes(t);
}

function addNativeChart(pptx, slide, chart, { x, y, w, h }) {
  const { chartType, data, title } = chart;
  const seriesData = data.datasets.map((ds, i) => ({
    name: ds.label || `Série ${i + 1}`,
    labels: data.labels,
    values: ds.values,
  }));
  // Couleurs : si dataset[0].colors (doughnut per-segment), sinon couleur par série
  const chartColors =
    data.datasets[0]?.colors ||
    data.datasets.map((ds) => ds.color).filter(Boolean) ||
    [PRIMARY];

  const baseOpts = {
    x, y, w, h,
    showTitle: true,
    title: title || "",
    titleFontSize: 11,
    titleColor: PRIMARY,
    titleFontFace: FONT,
    titleAlign: "left",
    chartColors,
    showLegend: data.datasets.length > 1 || chartType === "doughnut" || chartType === "pie",
    legendPos: "b",
    legendFontSize: 9,
    legendColor: TEXT,
    legendFontFace: FONT,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: TEXT_SEC,
    valAxisLabelColor: TEXT_SEC,
    catAxisLabelFontFace: FONT,
    valAxisLabelFontFace: FONT,
    showValue: false,
    dataLabelFontSize: 8,
    dataLabelColor: TEXT,
    catGridLine: { style: "none" },
    valGridLine: { style: "solid", size: 0.5, color: "F3F4F6" },
  };

  switch (chartType) {
    case "bar":
      slide.addChart(pptx.ChartType.bar, seriesData, { ...baseOpts, barDir: "col" });
      break;
    case "horizontalBar":
      slide.addChart(pptx.ChartType.bar, seriesData, { ...baseOpts, barDir: "bar" });
      break;
    case "stackedBar":
      slide.addChart(pptx.ChartType.bar, seriesData, {
        ...baseOpts, barDir: "col", barGrouping: "stacked",
      });
      break;
    case "line":
      slide.addChart(pptx.ChartType.line, seriesData, { ...baseOpts });
      break;
    case "doughnut":
      slide.addChart(pptx.ChartType.doughnut, seriesData, {
        ...baseOpts, holeSize: 60,
      });
      break;
    case "pie":
      slide.addChart(pptx.ChartType.pie, seriesData, { ...baseOpts });
      break;
    default:
      // No-op (caller should fallback to image)
      break;
  }
}

function addImageChart(slide, chart, { x, y, w, h }) {
  // Titre au-dessus
  slide.addText(chart.title || "", {
    x, y, w, h: 0.3,
    fontSize: 11, fontFace: FONT, color: PRIMARY, bold: true,
  });
  if (chart.image) {
    slide.addImage({
      data: chart.image,
      x, y: y + 0.3, w, h: h - 0.3,
      sizing: { type: "contain", w, h: h - 0.3 },
    });
  } else {
    slide.addText("(rendu chart indisponible)", {
      x, y: y + 0.3, w, h: h - 0.3,
      fontSize: 10, fontFace: FONT, color: TEXT_SEC, align: "center", valign: "middle",
      italic: true,
    });
  }
}

function addChartBlock(pptx, slide, chart, rect) {
  // pptx natif ne supporte pas le per-point coloring pour bar (sauf doughnut/pie).
  // → fallback image HD pour conserver les couleurs (ex: bar 15min coloré par intensité).
  const isPieFamily = chart.chartType === "doughnut" || chart.chartType === "pie";
  const hasPerPoint = chart.data?.hasPerPointColors;
  const perPointBlocksNative = hasPerPoint && !isPieFamily;

  const useNative =
    chartTypeSupportsNative(chart.chartType) &&
    chart.data?.datasets?.length > 0 &&
    chart.data?.labels?.length > 0 &&
    !perPointBlocksNative;
  if (useNative) {
    addNativeChart(pptx, slide, chart, rect);
  } else {
    addImageChart(slide, chart, rect);
  }
}

// Layout 2×2 (jusqu'à 4 charts par slide)
function chartGridRects(n) {
  const gap = 0.2;
  if (n === 1) {
    return [{ x: MARGIN, y: CONTENT_Y, w: CONTENT_W, h: CONTENT_H }];
  }
  if (n === 2) {
    const w = (CONTENT_W - gap) / 2;
    return [
      { x: MARGIN, y: CONTENT_Y, w, h: CONTENT_H },
      { x: MARGIN + w + gap, y: CONTENT_Y, w, h: CONTENT_H },
    ];
  }
  if (n === 3) {
    const w = (CONTENT_W - gap) / 2;
    const h = (CONTENT_H - gap) / 2;
    return [
      { x: MARGIN, y: CONTENT_Y, w, h },
      { x: MARGIN + w + gap, y: CONTENT_Y, w, h },
      { x: MARGIN, y: CONTENT_Y + h + gap, w: CONTENT_W, h },
    ];
  }
  // 4
  const w = (CONTENT_W - gap) / 2;
  const h = (CONTENT_H - gap) / 2;
  return [
    { x: MARGIN, y: CONTENT_Y, w, h },
    { x: MARGIN + w + gap, y: CONTENT_Y, w, h },
    { x: MARGIN, y: CONTENT_Y + h + gap, w, h },
    { x: MARGIN + w + gap, y: CONTENT_Y + h + gap, w, h },
  ];
}

function addChartsSlide(pptx, charts, tabLabel, eventName, pageInfo) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  addHeader(pptx, slide, tabLabel, "");
  addFooter(pptx, slide, eventName, pageInfo);

  const rects = chartGridRects(charts.length);
  charts.forEach((chart, i) => addChartBlock(pptx, slide, chart, rects[i]));
}

function addNoteSlide(pptx, text, tabLabel, eventName) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  addHeader(pptx, slide, tabLabel, "");
  addFooter(pptx, slide, eventName, "");
  slide.addText(text, {
    x: 1, y: 3, w: 11.3, h: 1.5,
    fontSize: 16, fontFace: FONT, color: TEXT,
    align: "center", valign: "middle", italic: true,
  });
}

function addAnalysisSlides(pptx, analysisSections, eventName) {
  const SECTIONS_PER_SLIDE = 3;
  const total = Math.ceil(analysisSections.length / SECTIONS_PER_SLIDE);
  for (let i = 0; i < analysisSections.length; i += SECTIONS_PER_SLIDE) {
    const chunk = analysisSections.slice(i, i + SECTIONS_PER_SLIDE);
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addHeader(pptx, slide, "Analyse", `Partie ${Math.floor(i / SECTIONS_PER_SLIDE) + 1} / ${total}`);
    addFooter(pptx, slide, eventName, "");
    let yPos = CONTENT_Y;
    const sectionH = (CONTENT_H - 0.3 * (chunk.length - 1)) / chunk.length;
    for (const section of chunk) {
      slide.addShape(pptx.ShapeType.rect, {
        x: MARGIN, y: yPos, w: 0.08, h: sectionH,
        fill: { color: PURPLE }, line: { color: PURPLE },
      });
      slide.addText(section.title, {
        x: MARGIN + 0.2, y: yPos, w: 12, h: 0.4,
        fontSize: 15, fontFace: FONT, color: PRIMARY, bold: true,
      });
      const bulletRows = section.bullets.map((b) => ({
        text: b,
        options: { bullet: { code: "2022" }, fontSize: 11, color: TEXT, fontFace: FONT, paraSpaceAfter: 4 },
      }));
      slide.addText(bulletRows, {
        x: MARGIN + 0.4, y: yPos + 0.4, w: 12, h: sectionH - 0.5,
        valign: "top",
      });
      yPos += sectionH + 0.3;
    }
  }
}

/**
 * Groupe les blocks "chart" et "chart-row" en chunks de 4 charts pour 4-up.
 * Renvoie une liste de slide-groups : [{ kind:"kpi", kpis }, { kind:"charts", charts:[...] }, { kind:"note", text }]
 */
function planSlides(blocks) {
  const slides = [];
  let pendingCharts = [];
  const flush = () => {
    if (pendingCharts.length > 0) {
      slides.push({ kind: "charts", charts: pendingCharts });
      pendingCharts = [];
    }
  };
  for (const block of blocks) {
    if (block.type === "kpi-grid") {
      flush();
      slides.push({ kind: "kpi", kpis: block.kpis });
    } else if (block.type === "kpi-compare-grid") {
      flush();
      slides.push({ kind: "kpi-compare", cards: block.cards });
    } else if (block.type === "chart") {
      pendingCharts.push(block);
      if (pendingCharts.length === 4) flush();
    } else if (block.type === "chart-row") {
      // Si on a déjà 3+ charts en attente, flush avant
      if (pendingCharts.length + block.charts.length > 4) flush();
      for (const c of block.charts) {
        pendingCharts.push(c);
        if (pendingCharts.length === 4) flush();
      }
    } else if (block.type === "note") {
      flush();
      slides.push({ kind: "note", text: block.text });
    }
  }
  flush();
  return slides;
}

export function useExportPptx() {
  const exportingPptx = ref(false);

  async function exportToPptx(tabsContainer, tabs, stats, registeredCount, eventName, compareStats = null, compareEventName = null, delegates = null, compareDelegates = null) {
    exportingPptx.value = true;
    try {
      const [PptxGenJS, html2canvas] = await Promise.all([
        import("pptxgenjs").then((m) => m.default),
        import("html2canvas").then((m) => m.default),
      ]);

      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "CYIM Statistics Dashboard";
      pptx.company = "CYIM";
      pptx.title = `Stats ${eventName || ""}`;

      const date = new Date().toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      });

      addCoverSlide(pptx, eventName, stats.global.totalDelegatesCount, date);

      const tabElements = [...tabsContainer.querySelectorAll("[data-tab-id]")];
      const totalTabs = tabElements.length;
      let tabIdx = 0;

      for (const tabEl of tabElements) {
        tabIdx++;
        const tabId = tabEl.getAttribute("data-tab-id");
        const tab = tabs.find((t) => t.id === tabId);
        const label = tab?.label || tabId;
        const pageInfo = `${tabIdx} / ${totalTabs}`;

        addTabDivider(pptx, label, eventName);

        const blocks = await extractTabSpec(tabEl, { html2canvas });
        const slidePlans = planSlides(blocks);

        for (const plan of slidePlans) {
          if (plan.kind === "kpi") {
            addKpiSlide(pptx, plan.kpis, label, eventName);
          } else if (plan.kind === "kpi-compare") {
            addKpiCompareSlide(pptx, plan.cards, label, eventName);
          } else if (plan.kind === "charts") {
            addChartsSlide(pptx, plan.charts, label, eventName, pageInfo);
          } else if (plan.kind === "note") {
            addNoteSlide(pptx, plan.text, label, eventName);
          }
        }
      }

      const analysis = generateAnalysis(stats, registeredCount, eventName, {
        compareStats, compareEventName, delegates, compareDelegates,
      }) || [];
      if (analysis.length > 0) {
        addAnalysisSlides(pptx, analysis, eventName);
      }

      const safeName = (eventName || "stats").replace(/[^a-zA-Z0-9-_]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      await pptx.writeFile({ fileName: `stats-${safeName}-${dateStr}.pptx` });
    } catch (e) {
      console.error("PPTX export failed:", e);
      alert("Erreur lors de l'export PPTX : " + e.message);
    } finally {
      exportingPptx.value = false;
    }
  }

  return { exportingPptx, exportToPptx };
}
