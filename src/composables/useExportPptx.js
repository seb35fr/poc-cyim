import { ref } from "vue";
import { generateAnalysis } from "../utils/generateAnalysis.js";

// Couleurs CYIM
const PRIMARY = "1E4E66";
const ACCENT = "30DD92";
const PURPLE = "6F45FF";
const TEXT = "414141";
const TEXT_SEC = "646464";
const BG = "F5F6FA";

/**
 * Capture un element DOM complet en base64 PNG via html2canvas.
 */
async function captureElement(html2canvas, element) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#f5f6fa",
  });
  return canvas.toDataURL("image/png");
}

/**
 * Ajoute une slide de titre.
 */
function addTitleSlide(pptx, eventName, totalCount, date) {
  const slide = pptx.addSlide();
  slide.background = { color: PRIMARY };

  slide.addText(eventName || "Statistiques", {
    x: 0.5, y: 1.5, w: 12, h: 1.2,
    fontSize: 36, fontFace: "Arial", color: "FFFFFF", bold: true,
  });
  slide.addText("Dashboard Statistiques Registration", {
    x: 0.5, y: 2.7, w: 12, h: 0.6,
    fontSize: 18, fontFace: "Arial", color: ACCENT,
  });
  slide.addText(`${totalCount.toLocaleString("fr-FR")} inscrits — ${date}`, {
    x: 0.5, y: 3.5, w: 12, h: 0.5,
    fontSize: 14, fontFace: "Arial", color: "BBDDEE",
  });
  slide.addText("CYIM", {
    x: 10.5, y: 6.5, w: 2, h: 0.4,
    fontSize: 12, fontFace: "Arial", color: "BBDDEE", align: "right",
  });
}

/**
 * Ajoute une ou plusieurs slides pour un onglet (screenshot complet).
 * Si le contenu est tres haut, on le decoupe en plusieurs slides.
 */
function addTabSlides(pptx, tabLabel, imageData, imgWidth, imgHeight) {
  // Dimensions utiles du slide LAYOUT_WIDE : 13.33 x 7.5 pouces
  const slideW = 13.33;
  const slideH = 7.5;
  const titleH = 0.7;
  const margin = 0.2;
  const contentW = slideW - margin * 2;
  const contentH = slideH - titleH - margin * 2;

  // Ratio de l'image
  const imgRatio = imgWidth / imgHeight;
  const fitW = contentW;
  const fitH = fitW / imgRatio;

  if (fitH <= contentH) {
    // L'image tient sur une seule slide
    const slide = pptx.addSlide();
    slide.background = { color: BG };
    addTabTitle(pptx, slide, tabLabel);
    slide.addImage({
      data: imageData,
      x: margin,
      y: titleH + margin,
      w: fitW,
      h: fitH,
      sizing: { type: "contain", w: fitW, h: contentH },
    });
  } else {
    // Decoupe en plusieurs slides (crop vertical)
    const totalPxH = imgHeight;
    const pxPerSlide = Math.floor(totalPxH * (contentH / fitH));
    const numSlides = Math.ceil(totalPxH / pxPerSlide);

    for (let i = 0; i < numSlides; i++) {
      const slide = pptx.addSlide();
      slide.background = { color: BG };
      const suffix = numSlides > 1 ? ` (${i + 1}/${numSlides})` : "";
      addTabTitle(pptx, slide, tabLabel + suffix);

      // On place l'image entiere mais decalee vers le haut
      const scaleH = fitH;
      const offsetY = -(i * contentH);
      slide.addImage({
        data: imageData,
        x: margin,
        y: titleH + margin + offsetY,
        w: fitW,
        h: scaleH,
      });
    }
  }
}

function addTabTitle(pptx, slide, label) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.7,
    fill: { color: PRIMARY },
  });
  slide.addText(label, {
    x: 0.4, y: 0.05, w: 12, h: 0.6,
    fontSize: 20, fontFace: "Arial", color: "FFFFFF", bold: true,
  });
}

/**
 * Ajoute les slides d'analyse.
 */
function addAnalysisSlides(pptx, analysisSections) {
  const SECTIONS_PER_SLIDE = 4;
  for (let i = 0; i < analysisSections.length; i += SECTIONS_PER_SLIDE) {
    const chunk = analysisSections.slice(i, i + SECTIONS_PER_SLIDE);
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 13.33, h: 0.7,
      fill: { color: PURPLE },
    });
    slide.addText(i === 0 ? "Analyse" : "Analyse (suite)", {
      x: 0.4, y: 0.05, w: 12, h: 0.6,
      fontSize: 20, fontFace: "Arial", color: "FFFFFF", bold: true,
    });

    let yPos = 0.95;
    for (const section of chunk) {
      slide.addText(section.title, {
        x: 0.4, y: yPos, w: 12, h: 0.35,
        fontSize: 14, fontFace: "Arial", color: PRIMARY, bold: true,
      });
      yPos += 0.35;

      const bulletRows = section.bullets.map((b) => ({
        text: b,
        options: { bullet: { code: "2022" }, fontSize: 11, color: TEXT, fontFace: "Arial" },
      }));
      const bulletHeight = Math.max(0.3, section.bullets.length * 0.28);
      slide.addText(bulletRows, {
        x: 0.6, y: yPos, w: 11.5, h: bulletHeight,
        valign: "top",
        paraSpaceAfter: 4,
      });
      yPos += bulletHeight + 0.15;
    }
  }
}

export function useExportPptx() {
  const exportingPptx = ref(false);

  async function exportToPptx(tabsContainer, tabs, stats, registeredCount, eventName) {
    exportingPptx.value = true;
    try {
      const [PptxGenJS, html2canvas] = await Promise.all([
        import("pptxgenjs").then((m) => m.default),
        import("html2canvas").then((m) => m.default),
      ]);

      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "CYIM Statistics Dashboard";

      const date = new Date().toLocaleDateString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
      });

      // Slide de titre
      addTitleSlide(pptx, eventName, stats.global.totalDelegatesCount, date);

      // Slides par onglet : screenshot complet de chaque tab
      const tabElements = tabsContainer.querySelectorAll("[data-tab-id]");
      for (const tabEl of tabElements) {
        const tabId = tabEl.getAttribute("data-tab-id");
        const tab = tabs.find((t) => t.id === tabId);
        const label = tab?.label || tabId;

        const imageData = await captureElement(html2canvas, tabEl);
        // Recuperer les dimensions reelles du canvas pour le ratio
        const rect = tabEl.getBoundingClientRect();
        addTabSlides(pptx, label, imageData, rect.width, rect.height);
      }

      // Slides d'analyse
      const analysis = generateAnalysis(stats, registeredCount, eventName);
      addAnalysisSlides(pptx, analysis);

      // Telecharger
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
