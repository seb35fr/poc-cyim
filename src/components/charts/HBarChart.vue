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
  color: { type: String, default: "#0F2D69" },
  height: { type: Number, default: 260 },
});

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [{
    data: props.data,
    backgroundColor: props.color,
    borderRadius: 4,
    barThickness: Math.min(24, Math.max(12, 300 / (props.labels?.length || 1))),
  }],
}));

const chartOptions = {
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      color: "#374151",
      font: { weight: 600, size: 11 },
    },
  },
  scales: {
    x: { display: false, grid: { display: false } },
    y: { grid: { display: false }, ticks: { font: { size: 12 } } },
  },
};
</script>
