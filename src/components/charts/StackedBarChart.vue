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
  datasets: Array,
  height: { type: Number, default: 260 },
  horizontal: { type: Boolean, default: false },
});

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets,
}));

const chartOptions = computed(() => ({
  indexAxis: props.horizontal ? "y" : "x",
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } } },
  },
}));
</script>
