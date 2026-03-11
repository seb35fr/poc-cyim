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
  colors: { type: Array, default: () => ["#0F2D69", "#30DD92", "#FFA600", "#E53935", "#8b5cf6", "#e5e7eb"] },
  showLabels: { type: Boolean, default: true },
});

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [{ data: props.data, backgroundColor: props.colors, borderWidth: 0, spacing: 2 }],
}));

const chartOptions = {
  cutout: "68%",
  responsive: true,
  maintainAspectRatio: true,
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
};
</script>
