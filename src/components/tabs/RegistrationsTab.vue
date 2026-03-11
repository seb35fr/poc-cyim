<template>
  <div v-if="stats">
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Types d'inscription</div>
        <div class="kpi-value">{{ stats.registrations.types.length }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Catégories</div>
        <div class="kpi-value">{{ stats.registrations.categories.length }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Multi-inscriptions</div>
        <div class="kpi-value">{{ stats.registrations.multiRegistrations.length }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Jours d'accès distincts</div>
        <div class="kpi-value">{{ stats.registrations.accessDays.length }}</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Répartition par type d'inscription</h3>
        <HBarChart
          :labels="stats.registrations.types.map(t => t.value)"
          :data="stats.registrations.types.map(t => t.totalCount)"
          color="#0F2D69"
          :height="Math.max(200, stats.registrations.types.length * 32)"
        />
      </div>
      <div class="chart-card">
        <h3>Statut par type (top 8)</h3>
        <StackedBarChart
          :labels="statusByTypeLabels"
          :datasets="statusByTypeDatasets"
          :horizontal="true"
          :height="280"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 15 catégories</h3>
        <HBarChart
          :labels="stats.registrations.categories.slice(0,15).map(c => c.value)"
          :data="stats.registrations.categories.slice(0,15).map(c => c.totalCount)"
          color="#8b5cf6"
          :height="Math.max(200, Math.min(15, stats.registrations.categories.length) * 30)"
        />
      </div>
      <div class="chart-card">
        <h3>Jours d'accès</h3>
        <HBarChart
          v-if="stats.registrations.accessDays.length > 0"
          :labels="stats.registrations.accessDays.map(a => a.value)"
          :data="stats.registrations.accessDays.map(a => a.totalCount)"
          color="#30DD92"
          :height="Math.max(160, stats.registrations.accessDays.length * 32)"
        />
        <p v-else class="empty-msg">Aucun jour d'accès configuré</p>
      </div>
    </div>

    <div class="chart-card" v-if="stats.registrations.multiRegistrations.length > 0" style="margin-top: 16px;">
      <h3>Délégués avec inscriptions multiples ({{ stats.registrations.multiRegistrations.length }})</h3>
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Email</th><th>Nb inscriptions</th><th>Types</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in stats.registrations.multiRegistrations.slice(0, 50)" :key="d.id">
            <td>{{ d.name }}</td>
            <td>{{ d.email }}</td>
            <td>{{ d.count }}</td>
            <td>{{ d.types.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="stats.registrations.multiRegistrations.length > 50" class="empty-msg">
        ... et {{ stats.registrations.multiRegistrations.length - 50 }} autres
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import HBarChart from "../charts/HBarChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";

const props = defineProps({ stats: Object });

const STATUS_COLORS = {
  confirmed: "#30DD92",
  pending: "#FFA600",
  cancelled: "#E53935",
  refused: "#8b5cf6",
};

const statusByTypeLabels = computed(() =>
  (props.stats?.registrations?.types || []).slice(0, 8).map((t) => t.value)
);

const statusByTypeDatasets = computed(() => {
  const types = (props.stats?.registrations?.types || []).slice(0, 8);
  const allStatuses = [...new Set(types.flatMap((t) => Object.keys(t.statuses || {})))];
  return allStatuses.map((status) => ({
    label: status,
    data: types.map((t) => t.statuses?.[status] || 0),
    backgroundColor: STATUS_COLORS[status] || "#e5e7eb",
    borderRadius: 3,
  }));
});
</script>

<style scoped>
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
