<template>
  <div style="position: relative; max-height: 300px;">
    <Doughnut :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Doughnut } from "vue-chartjs";

const props = defineProps({
  labels: Array,
  data: Array,
  colors: { type: Array, default: () => ["#1E4E66", "#30DD92", "#FFA600", "#E53935", "#6F45FF", "#e5e7eb"] },
  showLabels: { type: Boolean, default: true },
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
  const colors = (props.labels || []).map((label, i) => {
    const base = props.colors[i % props.colors.length];
    if (props.activeLabel && label !== props.activeLabel) return dimColor(base, 0.2);
    return base;
  });
  return {
    labels: props.labels,
    datasets: [{ data: props.data, backgroundColor: colors, borderWidth: 0, spacing: 2 }],
  };
});

const chartOptions = computed(() => ({
  cutout: "68%",
  responsive: true,
  maintainAspectRatio: true,
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
      display: (ctx) => {
        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
        return total > 0 && ctx.dataset.data[ctx.dataIndex] / total > 0.05;
      },
      color: "#fff",
      font: { weight: 600, size: 12 },
      formatter: (v, ctx) => {
        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
        return total > 0 ? Math.round((v / total) * 100) + "%" : "";
      },
    },
  },
}));
</script>
