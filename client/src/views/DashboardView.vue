<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, PieChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { useAppStore } from '@/stores/app';
import { costsApi } from '@/composables/useApi';
import type { CostTrend, CostByDimension, TopResource, Anomaly } from '@/types';
import { anomaliesApi } from '@/composables/useApi';

use([
  CanvasRenderer,
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
]);

const store = useAppStore();
const trendData = ref<CostTrend[]>([]);
const serviceData = ref<CostByDimension[]>([]);
const regionData = ref<CostByDimension[]>([]);
const topResources = ref<TopResource[]>([]);
const anomalies = ref<Anomaly[]>([]);
const totalSpend = ref(0);
const prevSpend = ref(0);

const spendChangePct = computed(() => {
  if (prevSpend.value === 0) return 0;
  return ((totalSpend.value - prevSpend.value) / prevSpend.value) * 100;
});

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: trendData.value.map((d) => d.period),
    axisLabel: { fontSize: 11 },
  },
  yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
  series: [
    {
      type: 'line',
      data: trendData.value.map((d) => d.amount),
      smooth: true,
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
          ],
        },
      },
      lineStyle: { color: '#3B82F6', width: 2 },
      itemStyle: { color: '#3B82F6' },
    },
  ],
}));

const servicePieOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)',
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { fontSize: 11 },
  },
  series: [
    {
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      data: serviceData.value.slice(0, 8).map((d) => ({
        name: d.name,
        value: d.amount,
      })),
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.15)' },
      },
    },
  ],
}));

const regionBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 120, right: 20, top: 10, bottom: 10 },
  xAxis: { type: 'value', axisLabel: { fontSize: 11 } },
  yAxis: {
    type: 'category',
    data: regionData.value.slice(0, 8).map((d) => d.name).reverse(),
    axisLabel: { fontSize: 11 },
  },
  series: [
    {
      type: 'bar',
      data: regionData.value.slice(0, 8).map((d) => d.amount).reverse(),
      itemStyle: { color: '#8B5CF6', borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 24,
    },
  ],
}));

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

async function loadDashboard() {
  const month = store.selectedMonth;

  const [trend, services, regions, top, anomalyData] = await Promise.all([
    costsApi.trend().then((r) => r.data),
    costsApi.byService(month).then((r) => r.data),
    costsApi.byRegion(month).then((r) => r.data),
    costsApi.topResources(month, 5).then((r) => r.data),
    anomaliesApi.detect(month).then((r) => r.data).catch(() => []),
  ]);

  trendData.value = trend;
  serviceData.value = services;
  regionData.value = regions;
  topResources.value = top;
  anomalies.value = anomalyData;

  totalSpend.value = services.reduce((s: number, d: CostByDimension) => s + d.amount, 0);

  // Get previous month total
  const months = store.availableMonths;
  const idx = months.indexOf(month);
  if (idx > 0) {
    const prevServices = await costsApi.byService(months[idx - 1]).then((r) => r.data);
    prevSpend.value = prevServices.reduce((s: number, d: CostByDimension) => s + d.amount, 0);
  }
}

onMounted(async () => {
  await store.fetchMonths();
  await store.fetchBills();
  await loadDashboard();
});

watch(() => store.selectedMonth, loadDashboard);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p class="text-sm text-gray-500 mt-1">Overview of your Alibaba Cloud spending</p>
      </div>
      <div class="flex items-center gap-3">
        <select
          v-model="store.selectedMonth"
          class="select w-40"
        >
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="card">
        <p class="card-title">Total Spend</p>
        <p class="card-value">{{ formatCurrency(totalSpend) }}</p>
        <p v-if="prevSpend > 0" class="text-xs mt-1" :class="spendChangePct >= 0 ? 'text-red-500' : 'text-green-500'">
          {{ spendChangePct >= 0 ? '+' : '' }}{{ spendChangePct.toFixed(1) }}% vs prev month
        </p>
      </div>
      <div class="card">
        <p class="card-title">Services Used</p>
        <p class="card-value">{{ serviceData.length }}</p>
        <p class="text-xs text-gray-400 mt-1">active services</p>
      </div>
      <div class="card">
        <p class="card-title">Bills Uploaded</p>
        <p class="card-value">{{ store.bills.length }}</p>
        <p class="text-xs text-gray-400 mt-1">{{ store.availableMonths.length }} months</p>
      </div>
      <div class="card">
        <p class="card-title">Anomalies</p>
        <p class="card-value" :class="anomalies.length > 0 ? 'text-red-600' : 'text-green-600'">
          {{ anomalies.length }}
        </p>
        <p class="text-xs text-gray-400 mt-1">detected this month</p>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <!-- Trend Chart -->
      <div class="card lg:col-span-2">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Monthly Spend Trend</h3>
        <v-chart :option="trendOption" style="height: 280px" autoresize />
      </div>

      <!-- Service Pie -->
      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cost by Service</h3>
        <v-chart :option="servicePieOption" style="height: 280px" autoresize />
      </div>
    </div>

    <!-- Bottom Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Region Bar Chart -->
      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cost by Region</h3>
        <v-chart :option="regionBarOption" style="height: 250px" autoresize />
      </div>

      <!-- Top Resources -->
      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Top Resources</h3>
        <div class="space-y-3">
          <div
            v-for="(resource, idx) in topResources"
            :key="idx"
            class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
          >
            <div>
              <p class="text-sm font-medium text-gray-800">
                {{ resource.resourceName || resource.instanceId || resource.productName }}
              </p>
              <p class="text-xs text-gray-400">
                {{ resource.productName }} &middot; {{ resource.region || '-' }}
              </p>
            </div>
            <p class="text-sm font-semibold text-gray-900">
              {{ formatCurrency(resource.amount) }}
            </p>
          </div>
          <p v-if="topResources.length === 0" class="text-sm text-gray-400 text-center py-4">
            No data available
          </p>
        </div>
      </div>
    </div>

    <!-- Recent Anomalies -->
    <div v-if="anomalies.length > 0" class="card mt-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Recent Anomalies</h3>
      <div class="space-y-2">
        <div
          v-for="(anomaly, idx) in anomalies.slice(0, 5)"
          :key="idx"
          class="flex items-center gap-3 p-3 rounded-lg"
          :class="{
            'bg-red-50': anomaly.severity === 'high',
            'bg-yellow-50': anomaly.severity === 'medium',
            'bg-blue-50': anomaly.severity === 'low',
          }"
        >
          <span
            class="badge"
            :class="{
              'badge-danger': anomaly.severity === 'high',
              'badge-warning': anomaly.severity === 'medium',
              'badge-info': anomaly.severity === 'low',
            }"
          >
            {{ anomaly.severity }}
          </span>
          <p class="text-sm text-gray-700 flex-1">{{ anomaly.explanation }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
