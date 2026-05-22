import { Chart } from "chart.js";

/**
 * Deep-clone qui préserve les références aux fonctions (importantes pour
 * Chart.js : backgroundColor: (ctx) => ..., formatter: ...).
 */
function cloneDeepPreserveFns(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  if (typeof obj === "function") return obj;
  if (Array.isArray(obj)) return obj.map(cloneDeepPreserveFns);
  const out = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = cloneDeepPreserveFns(obj[key]);
    }
  }
  return out;
}

/**
 * Re-render un Chart.js instance dans un canvas offscreen à haute résolution
 * pour un export PDF/PPTX net (PNG vectoriel-quality).
 *
 * @param {Chart} sourceChart - instance Chart.js obtenue via Chart.getChart(canvas)
 * @param {object} opts - { width, height }
 * @returns {Promise<string|null>} - dataURL PNG ou null si échec
 */
export async function chartToHighDpiImage(sourceChart, { width = 1600, height = 800 } = {}) {
  if (!sourceChart) return null;

  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  off.style.position = "fixed";
  off.style.left = "-30000px";
  off.style.top = "0";
  off.style.pointerEvents = "none";
  document.body.appendChild(off);

  try {
    const srcCfg = sourceChart.config;
    const cfg = {
      type: srcCfg.type,
      data: cloneDeepPreserveFns(srcCfg.data),
      options: cloneDeepPreserveFns(srcCfg.options || {}),
      plugins: srcCfg.plugins,
    };
    // Désactiver l'interactivité et l'animation pour rendu synchrone net
    cfg.options.animation = false;
    cfg.options.responsive = false;
    cfg.options.maintainAspectRatio = false;
    cfg.options.devicePixelRatio = 2;
    // Activer datalabels visibles dans l'export (le défaut global est display:false)
    cfg.options.plugins = cfg.options.plugins || {};
    cfg.options.plugins.datalabels = cfg.options.plugins.datalabels || {};
    // Si le chart avait des datalabels visibles, on les garde ; sinon on
    // n'active pas globalement pour éviter le bruit visuel.
    // Pour l'export, on rend une légende plus lisible :
    if (cfg.options.plugins.legend) {
      cfg.options.plugins.legend.labels = {
        ...(cfg.options.plugins.legend.labels || {}),
        font: { ...(cfg.options.plugins.legend.labels?.font || {}), size: 14 },
      };
    }
    // Augmenter la taille des ticks pour la lisibilité à grand format
    if (cfg.options.scales) {
      for (const axisKey of Object.keys(cfg.options.scales)) {
        const axis = cfg.options.scales[axisKey];
        if (!axis) continue;
        axis.ticks = axis.ticks || {};
        axis.ticks.font = { ...(axis.ticks.font || {}), size: 13 };
      }
    }

    const offChart = new Chart(off.getContext("2d"), cfg);
    offChart.update("none");
    // 1 frame pour laisser le moteur dessiner
    await new Promise((r) => requestAnimationFrame(r));
    const dataUrl = off.toDataURL("image/png");
    offChart.destroy();
    return dataUrl;
  } catch (e) {
    console.error("HD chart render failed:", e);
    return null;
  } finally {
    off.remove();
  }
}

/**
 * Récupère le Chart.js instance d'un <canvas> donné, s'il existe.
 */
export function getChartFromCanvas(canvas) {
  if (!canvas) return null;
  try {
    return Chart.getChart(canvas);
  } catch {
    return null;
  }
}
