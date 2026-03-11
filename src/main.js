import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import {
  Chart,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

Chart.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.plugins.datalabels.display = false;

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/:eventId",
      name: "statistics",
      component: () => import("./views/StatisticsView.vue"),
      props: true,
    },
    {
      path: "/",
      redirect: () => {
        return { path: "/no-event" };
      },
    },
  ],
});

createApp(App).use(router).mount("#app");
