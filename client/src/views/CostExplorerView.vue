<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { useAppStore } from '@/stores/app';
import { costsApi } from '@/composables/useApi';
import type { CostByDimension, TopResource, ComparisonResult } from '@/types';

use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent]);

const store = useAppStore();
const serviceData = ref<CostByDimension[]>([]);
const regionData = ref<CostByDimension[]>([]);
const subscriptionData = ref<CostByDimension[]>([]);
const topResources = ref<TopResource[]>([]);
const comparison = ref<ComparisonResult | null>(null);
const compareMode = ref(false);
const compareMonth = ref('');

const serviceBarOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 20, right: 20, top: 20, bottom: 60, containLabel: true },
  xAxis: {
    type: 'category',
    data: serviceData.value.map((d) => d.name),
    axisLabel: { rotate: 30, fontSize: 10, interval: 0 },
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: serviceData.value.map((d) => d.amount),
    itemStyle: {
      color: (params: { dataIndex: number }) => {
        const colors = ['#3B82F6', '#8B5CF6', '#06B6D4', '#F59E0B', '#EF4444', '#22C55E', '#EC4899', '#6366F1'];
        return colors[params.dataIndex % colors.length];
      },
      borderRadius: [4, 4, 0, 0],
    },
    barMaxWidth: 48,
  }],
}));

const subscriptionPieOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: '65%',
    data: subscriptionData.value.map((d) => ({ name: d.name, value: d.amount })),
    label: { show: false },
    emphasis: { itemStyle: { shadowBlur: 10 } },
  }],
}));

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val);
}

async function loadData() {
  const month = store.selectedMonth;
  const [services, regions, subs, top] = await Promise.all([
    costsApi.byService(month).then((r) => r.data),
    costsApi.byRegion(month).then((r) => r.data),
    costsApi.bySubscriptionType(month).then((r) => r.data),
    costsApi.topResources(month, 20).then((r) => r.data),
  ]);
  serviceData.value = services;
  regionData.value = regions;
  subscriptionData.value = subs;
  topResources.value = top;
}

async function loadComparison() {
  if (!compareMonth.value || !store.selectedMonth) return;
  const { data } = await costsApi.compare(store.selectedMonth, compareMonth.value);
  comparison.value = data;
}

onMounted(async () => {
  await store.fetchMonths();
  await loadData();
});

watch(() => store.selectedMonth, loadData);
watch(compareMode, (val) => {
  if (val && store.availableMonths.length > 1) {
    const idx = store.availableMonths.indexOf(store.selectedMonth);
    if (idx > 0) compareMonth.value = store.availableMonths[idx - 1];
  }
  comparison.value = null;
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Cost Explorer</h1>
        <p class="text-sm text-gray-500 mt-1">Drill down into your Alibaba Cloud spending</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="compareMode" class="rounded" />
          Compare
        </label>
        <select v-if="compareMode" v-model="compareMonth" class="select w-32" @change="loadComparison">
          <option v-for="m in store.availableMonths.filter(m => m !== store.selectedMonth)" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="store.selectedMonth" class="select w-40">
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </div>

    <!-- Comparison Banner -->
    <div v-if="comparison" class="card mb-6 border-primary-200 bg-primary-50">
      <div class="flex items-center gap-6">
        <div>
          <p class="text-xs text-primary-600 font-medium">vs {{ comparison.month2 }}</p>
          <p class="text-xl font-bold text-primary-900">{{ formatCurrency(comparison.totalMonth2) }}</p>
        </div>
        <svg class="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <div>
          <p class="text-xs text-primary-600 font-medium">{{ comparison.month1 }}</p>
          <p class="text-xl font-bold text-primary-900">{{ formatCurrency(comparison.totalMonth1) }}</p>
        </div>
        <div class="ml-auto text-right">
          <p class="text-xs text-primary-600">Change</p>
          <p class="text-lg font-bold" :class="comparison.totalChange >= 0 ? 'text-red-600' : 'text-green-600'">
            {{ comparison.totalChange >= 0 ? '+' : '' }}{{ comparison.totalChangePct.toFixed(1) }}%
          </p>
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <div class="card lg:col-span-2">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cost by Service</h3>
        <v-chart :option="serviceBarOption" style="height: 320px" autoresize />
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Subscription Type</h3>
        <v-chart :option="subscriptionPieOption" style="height: 320px" autoresize />
      </div>
    </div>

    <!-- Region + Top Resources Table -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cost by Region</h3>
        <div class="space-y-3">
          <div v-for="region in regionData" :key="region.name" class="flex items-center gap-3">
            <div class="flex-1">
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-700">{{ region.name }}</span>
                <span class="font-medium">{{ formatCurrency(region.amount) }}</span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-2">
                <div
                  class="bg-purple-500 h-2 rounded-full transition-all"
                  :style="{ width: region.percentage + '%' }"
                ></div>
              </div>
            </div>
            <span class="text-xs text-gray-400 w-12 text-right">{{ region.percentage.toFixed(1) }}%</span>
          </div>
          <p v-if="regionData.length === 0" class="text-sm text-gray-400 text-center py-4">No data</p>
        </div>
      </div>

      <div class="card">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Top Resources</h3>
        <div class="overflow-x-auto max-h-80 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-white">
              <tr class="border-b border-gray-100">
                <th class="text-left py-2 px-1 font-medium text-gray-500">Resource</th>
                <th class="text-left py-2 px-1 font-medium text-gray-500">Service</th>
                <th class="text-right py-2 px-1 font-medium text-gray-500">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in topResources" :key="i" class="border-b border-gray-50">
                <td class="py-2 px-1 text-gray-700 truncate max-w-32">{{ r.resourceName || r.instanceId || '-' }}</td>
                <td class="py-2 px-1 text-gray-500 text-xs">{{ r.productName }}</td>
                <td class="py-2 px-1 text-right font-mono">{{ formatCurrency(r.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Comparison Detail Table -->
    <div v-if="comparison" class="card mt-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Service Comparison Detail</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left py-2 px-2 font-medium text-gray-500">Service</th>
              <th class="text-right py-2 px-2 font-medium text-gray-500">{{ comparison.month2 }}</th>
              <th class="text-right py-2 px-2 font-medium text-gray-500">{{ comparison.month1 }}</th>
              <th class="text-right py-2 px-2 font-medium text-gray-500">Change</th>
              <th class="text-right py-2 px-2 font-medium text-gray-500">%</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in comparison.services" :key="s.name" class="border-b border-gray-50">
              <td class="py-2 px-2">{{ s.name }}</td>
              <td class="py-2 px-2 text-right font-mono">{{ formatCurrency(s.m2) }}</td>
              <td class="py-2 px-2 text-right font-mono">{{ formatCurrency(s.m1) }}</td>
              <td class="py-2 px-2 text-right font-mono" :class="s.change >= 0 ? 'text-red-600' : 'text-green-600'">
                {{ s.change >= 0 ? '+' : '' }}{{ formatCurrency(s.change) }}
              </td>
              <td class="py-2 px-2 text-right" :class="s.changePct >= 0 ? 'text-red-600' : 'text-green-600'">
                {{ s.changePct >= 0 ? '+' : '' }}{{ s.changePct.toFixed(1) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
