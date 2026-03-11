<template>
  <div :style="{ position: 'relative', height: height + 'px' }">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";

const props = defineProps({
  labels: Array,
  datasets: Array,
  height: { type: Number, default: 280 },
  yBeginAtZero: { type: Boolean, default: true },
});

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets,
}));

const hasY1 = computed(() => props.datasets?.some((ds) => ds.yAxisID === "y1"));

const chartOptions = computed(() => {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "circle" } },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: props.yBeginAtZero },
    },
  };
  if (hasY1.value) {
    opts.scales.y1 = {
      position: "right",
      grid: { display: false },
      ticks: { font: { size: 10 } },
      beginAtZero: true,
    };
  }
  return opts;
});
</script>
