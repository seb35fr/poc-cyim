<template>
  <div :style="{ position: 'relative', height: height + 'px' }">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Bar } from "vue-chartjs";

const props = defineProps({
  labels: Array,
  data: Array,
  color: { type: String, default: "#1E4E66" },
  // Palette par barre (optionnel). Si fourni, prevaut sur `color` —
  // chaque barre prend sa propre couleur (cf. couleurs par type d'inscription).
  colors: { type: Array, default: null },
  height: { type: Number, default: 260 },
  activeLabel: { type: [String, Array], default: null },
});

const emit = defineEmits(["select"]);

function dimColor(hex, alpha) {
  if (!hex || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isActive(label) {
  if (!props.activeLabel) return true;
  if (Array.isArray(props.activeLabel)) return props.activeLabel.includes(label);
  return label === props.activeLabel;
}

const chartData = computed(() => {
  const labels = props.labels || [];
  const palette = props.colors;
  const colors = labels.map((label, i) => {
    const base = palette && palette[i] ? palette[i] : props.color;
    if (props.activeLabel && !isActive(label)) return dimColor(base, 0.2);
    return base;
  });
  return {
    labels,
    datasets: [{
      data: props.data,
      backgroundColor: colors,
      borderRadius: 4,
      // Espacement garanti entre barres : la bande de catégorie n'est remplie
      // qu'à ~70% (categoryPercentage·barPercentage), le reste = gouttière. On
      // plafonne l'épaisseur (maxBarThickness) pour éviter des barres énormes
      // quand il y a peu de lignes. Remplace l'ancien barThickness fixe qui
      // collait les barres quand la bande ≈ épaisseur.
      categoryPercentage: 0.8,
      barPercentage: 0.88,
      maxBarThickness: 26,
    }],
  };
});

const chartOptions = computed(() => ({
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  // Marge a droite : reserve la place pour le datalabel en bout de barre (sinon
  // il deborde du canvas et est rogne quand la barre est longue).
  layout: { padding: { right: 44 } },
  onClick: (event, elements) => {
    if (elements.length > 0) {
      emit("select", props.labels[elements[0].index]);
    }
  },
  onHover: (event, elements) => {
    const canvas = event.native?.target;
    if (canvas) canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
  },
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      color: "#414141",
      font: { weight: 600, size: 13 },
    },
  },
  scales: {
    x: { display: false, grid: { display: false } },
    y: { grid: { display: false }, ticks: { font: { size: 14 } } },
  },
}));
</script>
