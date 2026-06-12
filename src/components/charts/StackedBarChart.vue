<template>
  <div :style="{ position: 'relative', height: height + 'px' }">
    <Bar :data="chartData" :options="chartOptions" :plugins="[totalsPlugin]" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Bar } from "vue-chartjs";

const props = defineProps({
  labels: Array,
  datasets: Array,
  height: { type: Number, default: 260 },
  horizontal: { type: Boolean, default: false },
  // Cross-filtering : si fourni, les rangees non-active sont dim (alpha 0.2).
  // Click sur une rangee emet @select(label).
  activeLabel: { type: [String, Array], default: null },
  // Affiche le total de chaque rangee au bout de la derniere segment. Utile
  // sur les stacked horizontaux pour donner l'ordre de grandeur.
  showTotal: { type: Boolean, default: false },
  // Position de la legende. "bottom" pour les charts a legende par type de
  // badge (sous l'abscisse, plus lisible), "top" par defaut ailleurs.
  legendPosition: { type: String, default: "top" },
  // Si true : cliquer un item de legende N'agit PLUS comme un toggle de
  // visibilite Chart.js, mais emet @select-legend(label du dataset). Utilise
  // pour transformer la legende (ex: types de badge) en filtre cross-clic.
  // activeLegend : label du dataset selectionne -> on dim les autres datasets.
  legendSelectable: { type: Boolean, default: false },
  activeLegend: { type: String, default: null },
});

const emit = defineEmits(["select", "select-legend"]);

function dimColor(hex, alpha = 0.2) {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isActiveRow(label) {
  if (!props.activeLabel) return true;
  if (Array.isArray(props.activeLabel)) return props.activeLabel.includes(label);
  return label === props.activeLabel;
}

const chartData = computed(() => {
  const labels = props.labels || [];
  const datasets = (props.datasets || []).map((ds) => {
    const baseColor = ds.backgroundColor;
    // activeLegend (filtre par dataset) : on dim tout le dataset non-selectionne.
    if (props.activeLegend && ds.label !== props.activeLegend) {
      return { ...ds, backgroundColor: dimColor(baseColor, 0.2) };
    }
    // Si activeLabel est defini, on dim les rangees non-actives. Couleur par
    // segment (array) pour permettre le dim par index.
    const colors = labels.map((label) => {
      if (!props.activeLabel) return baseColor;
      return isActiveRow(label) ? baseColor : dimColor(baseColor, 0.2);
    });
    return { ...ds, backgroundColor: colors };
  });
  return { labels, datasets };
});

// Plugin : ecrit le total de chaque rangee au bout de la derniere segment.
// Pas via datalabels pour eviter les doublons sur les segments intermediaires.
// Horizontal : a droite de la barre. Vertical : au-dessus de la pile.
const totalsPlugin = {
  id: "stacked-totals",
  afterDatasetsDraw(chart) {
    if (!props.showTotal) return;
    const { ctx, data, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    if (!xScale || !yScale) return;
    const labels = data.labels || [];
    ctx.save();
    ctx.font = "600 11px Poppins, Comfortaa, sans-serif";
    ctx.fillStyle = "#414141";
    for (let i = 0; i < labels.length; i++) {
      let total = 0;
      for (const ds of data.datasets) total += ds.data[i] || 0;
      if (total <= 0) continue;
      if (props.horizontal) {
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const x = xScale.getPixelForValue(total) + 6;
        const y = yScale.getPixelForValue(labels[i]);
        ctx.fillText(String(total), x, y);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const x = xScale.getPixelForValue(labels[i]);
        const y = yScale.getPixelForValue(total) - 4;
        ctx.fillText(String(total), x, y);
      }
    }
    ctx.restore();
  },
};

const chartOptions = computed(() => ({
  indexAxis: props.horizontal ? "y" : "x",
  responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: {
      right: props.showTotal && props.horizontal ? 36 : 0,
      top: props.showTotal && !props.horizontal ? 18 : 0,
    },
  },
  onClick: (event, elements, chart) => {
    // Click tolerant : si le clic ne tape pas exactement un segment (barres fines,
    // clic au-dessus de la pile ou dans un gap entre deux categories), on retombe
    // sur le mode "index" (intersect:false) qui renvoie la colonne la plus proche.
    // Evite l'impression que "le filtre ne marche pas".
    let index = elements.length > 0 ? elements[0].index : null;
    if (index == null && chart) {
      const pts = chart.getElementsAtEventForMode(event, "index", { intersect: false }, false);
      if (pts.length > 0) index = pts[0].index;
    }
    if (index != null) emit("select", props.labels[index]);
  },
  onHover: (event, elements, chart) => {
    const canvas = event.native?.target;
    if (!canvas) return;
    // Curseur "pointer" des qu'on survole une colonne (meme hors segment), pour
    // signaler que tout le chart est cliquable.
    let hit = elements.length > 0;
    if (!hit && chart) {
      hit = chart.getElementsAtEventForMode(event, "index", { intersect: false }, false).length > 0;
    }
    canvas.style.cursor = hit ? "pointer" : "default";
  },
  plugins: {
    legend: {
      position: props.legendPosition,
      labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" },
      // Legende-filtre : clic sur un item -> emet le label du dataset au lieu du
      // toggle de visibilite natif Chart.js.
      ...(props.legendSelectable
        ? {
            onClick: (e, legendItem) => {
              const ds = props.datasets?.[legendItem.datasetIndex];
              if (ds) emit("select-legend", ds.label);
            },
          }
        : {}),
    },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        // Affiche label + valeur du segment hovered (Chart.js le fait deja
        // par defaut, mais on ajoute le total ligne au footer pour le context).
        footer: (items) => {
          if (!items || items.length === 0) return "";
          const i = items[0].dataIndex;
          const chart = items[0].chart;
          let total = 0;
          for (const ds of chart.data.datasets) total += ds.data[i] || 0;
          return total > 0 ? `Total : ${total}` : "";
        },
      },
    },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, grace: props.showTotal && !props.horizontal ? "12%" : 0 },
  },
}));

</script>
