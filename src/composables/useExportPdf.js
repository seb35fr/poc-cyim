import { ref } from "vue";
import { generateAnalysis } from "../utils/generateAnalysis.js";
import { extractTabSpec } from "../utils/exportSpec.js";

// Couleurs CYIM (RGB)
const PRIMARY = [30, 78, 102];
const ACCENT = [48, 221, 146];
const PURPLE = [111, 69, 255];
const TEXT = [65, 65, 65];
const TEXT_SEC = [100, 100, 100];
const BG = [245, 246, 250];
const CARD = [255, 255, 255];
const BORDER = [229, 231, 235];

// A4 paysage : 297 x 210 mm
const PAGE_W = 297;
const PAGE_H = 210;
const HEADER_H = 13;
const MARGIN = 9;
const FOOTER_H = 7;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_Y = HEADER_H + 4;
const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H - 6;

const rgbF = (pdf, c) => pdf.setFillColor(c[0], c[1], c[2]);
const rgbT = (pdf, c) => pdf.setTextColor(c[0], c[1], c[2]);
const rgbD = (pdf, c) => pdf.setDrawColor(c[0], c[1], c[2]);

function drawHeader(pdf, tabLabel, subTitle) {
  rgbF(pdf, PRIMARY);
  pdf.rect(0, 0, PAGE_W, HEADER_H, "F");
  rgbF(pdf, ACCENT);
  pdf.rect(0, HEADER_H, PAGE_W, 0.6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.text(tabLabel || "", MARGIN, HEADER_H / 2 + 1, { baseline: "middle" });
  if (subTitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(187, 221, 238);
    pdf.text(subTitle, PAGE_W - MARGIN, HEADER_H / 2 + 1, {
      baseline: "middle", align: "right",
    });
  }
}

function drawFooter(pdf, eventName, pageNum, totalPages) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  rgbT(pdf, TEXT_SEC);
  pdf.text(eventName || "CYIM Statistics", MARGIN, PAGE_H - 3);
  pdf.text(`Page ${pageNum} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 3, {
    align: "right",
  });
}

function drawTitlePage(pdf, eventName, totalCount, date) {
  rgbF(pdf, PRIMARY);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  rgbF(pdf, ACCENT);
  pdf.rect(0, 0, 4, PAGE_H, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(48, 221, 146);
  pdf.text("CYIM • STATISTICS", 18, 55);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  pdf.setTextColor(255, 255, 255);
  pdf.text(eventName || "Statistiques événement", 18, 80, { maxWidth: PAGE_W - 36 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.setTextColor(187, 221, 238);
  pdf.text("Dashboard Registration", 18, 95);

  pdf.setDrawColor(48, 221, 146);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(18, 130, 90, 30, 2, 2, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(255, 255, 255);
  pdf.text((totalCount || 0).toLocaleString("fr-FR"), 24, 147);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(187, 221, 238);
  pdf.text("inscrits", 24, 155);

  pdf.setFontSize(10);
  pdf.text(date, 18, 185);
}

function drawTabCover(pdf, tabLabel, eventName) {
  rgbF(pdf, BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  rgbF(pdf, PRIMARY);
  pdf.rect(0, 78, PAGE_W, 38, "F");
  rgbF(pdf, ACCENT);
  pdf.rect(0, 116, PAGE_W, 1.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(255, 255, 255);
  pdf.text(tabLabel, PAGE_W / 2, 102, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  rgbT(pdf, TEXT_SEC);
  pdf.text(eventName || "", PAGE_W / 2, 130, { align: "center" });
}

// Couleurs pour le delta chip (alignees avec le CSS UI : --good/--bad/--neutral)
const DELTA_COLORS = {
  good: { fill: [209, 250, 229], text: [4, 120, 87] },
  bad: { fill: [254, 226, 226], text: [185, 28, 28] },
  neutral: { fill: [243, 244, 246], text: [100, 100, 100] },
};

function drawKpiComparePage(pdf, cards) {
  rgbF(pdf, BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  const filtered = cards.filter((c) => c.rows && c.rows.length >= 2);
  const n = filtered.length;
  if (n === 0) return;

  // Layout : 2 colonnes x N lignes pour les cartes plus larges (3 cols internes
  // : current | delta | compare). Au-dela de 4 cartes, on passe a 3 colonnes.
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gap = 5;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = Math.min(38, (CONTENT_H - gap * (rows - 1)) / rows);
  const startY = CONTENT_Y + (CONTENT_H - cellH * rows - gap * (rows - 1)) / 2;

  filtered.forEach((card, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = startY + r * (cellH + gap);

    // Card background
    rgbF(pdf, CARD);
    rgbD(pdf, BORDER);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, cellW, cellH, 2, 2, "FD");

    // Label en haut + separateur
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    rgbT(pdf, TEXT_SEC);
    pdf.text((card.label || "").toUpperCase(), x + 4, y + 5, { maxWidth: cellW - 8 });
    rgbD(pdf, BORDER);
    pdf.setLineWidth(0.15);
    pdf.line(x + 4, y + 7, x + cellW - 4, y + 7);

    // 3 colonnes internes : A | delta | B
    const innerY = y + 8;
    const innerH = cellH - 10;
    const sideW = (cellW - 8) * 0.4;
    const deltaW = (cellW - 8) * 0.2;
    const xA = x + 4;
    const xDelta = xA + sideW;
    const xB = xDelta + deltaW;

    drawCompareSide(pdf, card.rows[0], xA, innerY, sideW, innerH, "left");
    drawCompareSide(pdf, card.rows[1], xB, innerY, sideW, innerH, "right");
    drawDeltaChip(pdf, card.delta, xDelta, innerY, deltaW, innerH);
  });
}

function drawCompareSide(pdf, row, x, y, w, h, align) {
  if (!row) return;
  const isRight = align === "right";

  // Header : dot + nom
  const dotColor = hexToRgb(row.color);
  pdf.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
  const dotX = isRight ? x + w - 1.5 : x + 1.5;
  pdf.circle(dotX, y + 2, 1.1, "F");

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  rgbT(pdf, TEXT_SEC);
  const nameX = isRight ? dotX - 3 : dotX + 3;
  pdf.text(row.name || "", nameX, y + 2.5, {
    align: isRight ? "right" : "left",
    maxWidth: w - 5,
    baseline: "middle",
  });

  // Valeur grande
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  rgbT(pdf, TEXT);
  const valX = isRight ? x + w : x;
  pdf.text(row.value || "—", valX, y + 12, { align: isRight ? "right" : "left" });

  // Sub
  if (row.sub) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    rgbT(pdf, TEXT_SEC);
    pdf.text(row.sub, valX, y + 16, {
      align: isRight ? "right" : "left",
      maxWidth: w,
    });
  }
}

function drawDeltaChip(pdf, delta, x, y, w, h) {
  if (!delta || !delta.text) return;
  const colors = DELTA_COLORS[delta.kind] || DELTA_COLORS.neutral;
  const cx = x + w / 2;
  const cy = y + 8;
  const chipW = Math.min(w - 2, 24);
  const chipH = 5.5;
  pdf.setFillColor(colors.fill[0], colors.fill[1], colors.fill[2]);
  pdf.setDrawColor(colors.fill[0], colors.fill[1], colors.fill[2]);
  pdf.roundedRect(cx - chipW / 2, cy - chipH / 2, chipW, chipH, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  pdf.text(delta.text, cx, cy, { align: "center", baseline: "middle" });
}

function drawKpiPage(pdf, kpis) {
  rgbF(pdf, BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  const filtered = kpis.filter((k) => k.value);
  const n = filtered.length;
  if (n === 0) return;

  const cols = Math.min(5, n);
  const rows = Math.ceil(n / cols);
  const gap = 4;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = Math.min(50, (CONTENT_H - gap * (rows - 1)) / rows);
  const startY = CONTENT_Y + (CONTENT_H - cellH * rows - gap * (rows - 1)) / 2;

  filtered.forEach((kpi, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = MARGIN + c * (cellW + gap);
    const y = startY + r * (cellH + gap);

    rgbF(pdf, CARD);
    rgbD(pdf, BORDER);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, cellW, cellH, 2, 2, "FD");

    const color = hexToRgb(kpi.color);
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(x, y, 1.5, cellH, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    rgbT(pdf, TEXT_SEC);
    pdf.text(kpi.label, x + 4, y + 6, { maxWidth: cellW - 6 });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(cellH > 35 ? 22 : 17);
    rgbT(pdf, TEXT);
    pdf.text(kpi.value, x + 4, y + cellH / 2 + 4);

    if (kpi.sub) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      rgbT(pdf, TEXT_SEC);
      pdf.text(kpi.sub, x + 4, y + cellH - 3, { maxWidth: cellW - 6 });
    }
  });
}

function hexToRgb(hex) {
  if (!hex) return [120, 120, 120];
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [120, 120, 120];
}

function drawChartRect(pdf, chart, rect) {
  const { x, y, w, h } = rect;
  rgbF(pdf, CARD);
  rgbD(pdf, BORDER);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, 1.5, 1.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  rgbT(pdf, PRIMARY);
  pdf.text(chart.title || "", x + 3, y + 5, { maxWidth: w - 6 });

  const imgY = y + 7;
  const imgH = h - 9;
  const imgW = w - 6;
  if (chart.image) {
    placeImageContained(pdf, chart.image, x + 3, imgY, imgW, imgH);
  } else {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    rgbT(pdf, TEXT_SEC);
    pdf.text("(rendu indisponible)", x + w / 2, y + h / 2, { align: "center" });
  }
}

function placeImageContained(pdf, dataUrl, x, y, w, h) {
  // On utilise les dimensions natives de l'image PNG (encodées dans le header)
  // mais comme on ne les a pas ici, on assume un aspect ratio 16:9 par défaut
  // (correspond à la résolution de chartToHighDpiImage 1600x900).
  const imgRatio = 1600 / 900;
  const boxRatio = w / h;
  let drawW = w;
  let drawH = h;
  if (imgRatio > boxRatio) {
    drawW = w;
    drawH = w / imgRatio;
  } else {
    drawH = h;
    drawW = h * imgRatio;
  }
  const ox = x + (w - drawW) / 2;
  const oy = y + (h - drawH) / 2;
  pdf.addImage(dataUrl, "PNG", ox, oy, drawW, drawH, undefined, "FAST");
}

function chartGridRectsPdf(n) {
  const gap = 3;
  const x0 = MARGIN;
  const y0 = CONTENT_Y;
  if (n === 1) return [{ x: x0, y: y0, w: CONTENT_W, h: CONTENT_H }];
  if (n === 2) {
    const w = (CONTENT_W - gap) / 2;
    return [
      { x: x0, y: y0, w, h: CONTENT_H },
      { x: x0 + w + gap, y: y0, w, h: CONTENT_H },
    ];
  }
  if (n === 3) {
    const w = (CONTENT_W - gap) / 2;
    const h = (CONTENT_H - gap) / 2;
    return [
      { x: x0, y: y0, w, h },
      { x: x0 + w + gap, y: y0, w, h },
      { x: x0, y: y0 + h + gap, w: CONTENT_W, h },
    ];
  }
  const w = (CONTENT_W - gap) / 2;
  const h = (CONTENT_H - gap) / 2;
  return [
    { x: x0, y: y0, w, h },
    { x: x0 + w + gap, y: y0, w, h },
    { x: x0, y: y0 + h + gap, w, h },
    { x: x0 + w + gap, y: y0 + h + gap, w, h },
  ];
}

function drawChartsPage(pdf, charts) {
  rgbF(pdf, BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  const rects = chartGridRectsPdf(charts.length);
  charts.forEach((chart, i) => drawChartRect(pdf, chart, rects[i]));
}

function drawNotePage(pdf, text) {
  rgbF(pdf, BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(13);
  rgbT(pdf, TEXT);
  pdf.text(text, PAGE_W / 2, PAGE_H / 2, {
    align: "center", maxWidth: PAGE_W - MARGIN * 4,
  });
}

function drawAnalysisPage(pdf, sections) {
  rgbF(pdf, CARD);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  let y = CONTENT_Y + 2;
  const blockH = (CONTENT_H - 4 * (sections.length - 1)) / sections.length;
  for (const section of sections) {
    rgbF(pdf, PURPLE);
    pdf.rect(MARGIN, y, 1.5, blockH - 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    rgbT(pdf, PRIMARY);
    pdf.text(section.title, MARGIN + 4, y + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    rgbT(pdf, TEXT);
    let by = y + 10;
    for (const bullet of section.bullets) {
      const lines = pdf.splitTextToSize(bullet, CONTENT_W - 8);
      pdf.text("•", MARGIN + 4, by);
      pdf.text(lines, MARGIN + 7, by);
      by += lines.length * 4.5 + 1;
      if (by > y + blockH - 2) break;
    }
    y += blockH + 4;
  }
}

function planPdfPages(blocks) {
  const pages = [];
  let pendingCharts = [];
  const flush = () => {
    if (pendingCharts.length > 0) {
      pages.push({ kind: "charts", charts: pendingCharts });
      pendingCharts = [];
    }
  };
  for (const block of blocks) {
    if (block.type === "kpi-grid") {
      flush();
      pages.push({ kind: "kpi", kpis: block.kpis });
    } else if (block.type === "kpi-compare-grid") {
      flush();
      pages.push({ kind: "kpi-compare", cards: block.cards });
    } else if (block.type === "chart") {
      pendingCharts.push(block);
      if (pendingCharts.length === 4) flush();
    } else if (block.type === "chart-row") {
      if (pendingCharts.length + block.charts.length > 4) flush();
      for (const c of block.charts) {
        pendingCharts.push(c);
        if (pendingCharts.length === 4) flush();
      }
    } else if (block.type === "note") {
      flush();
      pages.push({ kind: "note", text: block.text });
    }
  }
  flush();
  return pages;
}

export function useExportPdf() {
  const exporting = ref(false);

  async function exportToPdf(tabsContainer, tabs, stats, registeredCount, eventName, compareStats = null, compareEventName = null, delegates = null, compareDelegates = null) {
    exporting.value = true;
    try {
      const [{ jsPDF }, html2canvas] = await Promise.all([
        import("jspdf"),
        import("html2canvas").then((m) => m.default),
      ]);
      const pdf = new jsPDF({
        orientation: "landscape", unit: "mm", format: "a4", compress: true,
      });

      const date = new Date().toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      });

      const tabElements = [...tabsContainer.querySelectorAll("[data-tab-id]")];

      // Pré-extraction (toutes les images générées en amont pour fluidifier)
      const tabData = [];
      for (const tabEl of tabElements) {
        const tabId = tabEl.getAttribute("data-tab-id");
        const tab = tabs.find((t) => t.id === tabId);
        const label = tab?.label || tabId;
        const blocks = await extractTabSpec(tabEl, { html2canvas });
        const pagePlans = planPdfPages(blocks);
        tabData.push({ label, pagePlans });
      }

      const analysis = generateAnalysis(stats, registeredCount, eventName, {
        compareStats, compareEventName, delegates, compareDelegates,
      }) || [];
      const ANALYSIS_PER_PAGE = 3;
      const analysisPages = Math.ceil(analysis.length / ANALYSIS_PER_PAGE);

      let totalPages = 1; // cover
      for (const t of tabData) totalPages += 1 + t.pagePlans.length; // cover + plans
      totalPages += analysisPages;

      // Cover
      drawTitlePage(pdf, eventName, stats.global.totalDelegatesCount, date);
      let pageNum = 1;

      for (const { label, pagePlans } of tabData) {
        pdf.addPage();
        pageNum++;
        drawTabCover(pdf, label, eventName);
        drawFooter(pdf, eventName, pageNum, totalPages);

        for (const plan of pagePlans) {
          pdf.addPage();
          pageNum++;
          let headerSub = "";
          if (plan.kind === "kpi") headerSub = "Indicateurs clés";
          else if (plan.kind === "kpi-compare") headerSub = "Indicateurs comparés";
          drawHeader(pdf, label, headerSub);
          if (plan.kind === "kpi") drawKpiPage(pdf, plan.kpis);
          else if (plan.kind === "kpi-compare") drawKpiComparePage(pdf, plan.cards);
          else if (plan.kind === "charts") drawChartsPage(pdf, plan.charts);
          else if (plan.kind === "note") drawNotePage(pdf, plan.text);
          drawFooter(pdf, eventName, pageNum, totalPages);
        }
      }

      for (let i = 0; i < analysis.length; i += ANALYSIS_PER_PAGE) {
        const chunk = analysis.slice(i, i + ANALYSIS_PER_PAGE);
        pdf.addPage();
        pageNum++;
        drawHeader(pdf, "Analyse", `Partie ${Math.floor(i / ANALYSIS_PER_PAGE) + 1} / ${analysisPages}`);
        drawAnalysisPage(pdf, chunk);
        drawFooter(pdf, eventName, pageNum, totalPages);
      }

      const safeName = (eventName || "stats").replace(/[^a-zA-Z0-9-_]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      pdf.save(`stats-${safeName}-${dateStr}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("Erreur lors de l'export PDF : " + e.message);
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportToPdf };
}
