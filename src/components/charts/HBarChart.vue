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
  height: { type: Number, default: 260 },
  activeLabel: { type: String, default: null },
});

const emit = defineEmits(["select"]);

function dimColor(hex, alpha) {
  if (!hex || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const chartData = computed(() => {
  const colors = (props.labels || []).map((label) => {
    if (props.activeLabel && label !== props.activeLabel) return dimColor(props.color, 0.2);
    return props.color;
  });
  return {
    labels: props.labels,
    datasets: [{
      data: props.data,
      backgroundColor: colors,
      borderRadius: 4,
      barThickness: Math.min(24, Math.max(12, 300 / (props.labels?.length || 1))),
    }],
  };
});

const chartOptions = computed(() => ({
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
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
      font: { weight: 600, size: 11 },
    },
  },
  scales: {
    x: { display: false, grid: { display: false } },
    y: { grid: { display: false }, ticks: { font: { size: 12 } } },
  },
}));
</script>
