<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { resourcesApi } from '@/composables/useApi';
import { useAppStore } from '@/stores/app';
import type { ResourceInfo, ResourceCostHistory, CostByDimension } from '@/types';

use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent]);

const store = useAppStore();
const searchQuery = ref('');
const searchResults = ref<ResourceInfo[]>([]);
const selectedResource = ref<ResourceInfo | null>(null);
const costHistory = ref<ResourceCostHistory[]>([]);
const serviceBreakdown = ref<CostByDimension[]>([]);
const searching = ref(false);
const loading = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(val);
}

async function onSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (!searchQuery.value.trim()) {
      searchResults.value = [];
      return;
    }
    searching.value = true;
    try {
      const { data } = await resourcesApi.search(searchQuery.value);
      searchResults.value = data;
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      searching.value = false;
    }
  }, 300);
}

async function selectResource(resource: ResourceInfo) {
  selectedResource.value = resource;
  searchResults.value = [];
  searchQuery.value = '';
  loading.value = true;
  try {
    const id = resource.instanceId || resource.resourceName || '';
    const [historyRes, servicesRes] = await Promise.all([
      resourcesApi.history(id),
      resourcesApi.services(id, store.selectedMonth || undefined),
    ]);
    costHistory.value = historyRes.data;
    serviceBreakdown.value = servicesRes.data;
  } catch (e) {
    console.error('Load resource error:', e);
  } finally {
    loading.value = false;
  }
}

function clearSelection() {
  selectedResource.value = null;
  costHistory.value = [];
  serviceBreakdown.value = [];
}

const totalCost = computed(() => costHistory.value.reduce((s, r) => s + r.amount, 0));

const trendChartOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 20, right: 20, top: 20, bottom: 40, containLabel: true },
  xAxis: {
    type: 'category',
    data: costHistory.value.map((d) => d.period),
    axisLabel: { fontSize: 11 },
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: costHistory.value.map((d) => d.amount),
    itemStyle: {
      color: '#3B82F6',
      borderRadius: [4, 4, 0, 0],
    },
    barMaxWidth: 48,
  }],
}));

const pieChartOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: '65%',
    data: serviceBreakdown.value.map((d) => ({ name: d.name, value: d.amount })),
    label: { show: false },
    emphasis: { itemStyle: { shadowBlur: 10 } },
  }],
}));

// Reload services when month changes
watch(() => store.selectedMonth, async () => {
  if (selectedResource.value) {
    const id = selectedResource.value.instanceId || selectedResource.value.resourceName || '';
    try {
      const { data } = await resourcesApi.services(id, store.selectedMonth || undefined);
      serviceBreakdown.value = data;
    } catch (e) {
      console.error('Reload services error:', e);
    }
  }
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Resource Costs</h1>
        <p class="text-sm text-gray-500 mt-1">Search any resource and see its cost month by month</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-600">Billing Month</label>
        <select v-model="store.selectedMonth" class="select w-40">
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="relative mb-6">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          @input="onSearch"
          class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Search by resource name or instance ID (e.g. SAP-PRD-DB01)..."
        />
        <div v-if="searching" class="absolute right-3 top-1/2 -translate-y-1/2">
          <svg class="animate-spin w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
      </div>

      <!-- Search Results Dropdown -->
      <div
        v-if="searchResults.length > 0"
        class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto"
      >
        <div
          v-for="(r, i) in searchResults"
          :key="i"
          class="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
          @click="selectResource(r)"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-800">{{ r.resourceName || r.instanceId || '-' }}</p>
              <p class="text-xs text-gray-500">{{ r.productName }} &middot; {{ r.instanceId || '-' }}</p>
            </div>
            <span class="text-sm font-mono font-medium text-gray-700">{{ formatCurrency(r.totalCost) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- No Selection State -->
    <div v-if="!selectedResource && searchResults.length === 0" class="card text-center py-16">
      <svg class="mx-auto w-16 h-16 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p class="text-gray-500">Search for a resource by name or instance ID</p>
      <p class="text-gray-400 text-sm mt-1">e.g. SAP-PRD-DB01, i-sg-xxxxx</p>
    </div>

    <!-- Selected Resource Detail -->
    <div v-if="selectedResource">
      <!-- Resource Info Card -->
      <div class="card mb-6">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <div>
                <h2 class="text-lg font-bold text-gray-900">{{ selectedResource.resourceName || selectedResource.instanceId || '-' }}</h2>
                <p class="text-sm text-gray-500">{{ selectedResource.productName }} &middot; {{ selectedResource.instanceId || '-' }}</p>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="text-xs text-gray-500">Total Cost (All Months)</p>
              <p class="text-xl font-bold text-primary-700">{{ formatCurrency(totalCost) }}</p>
            </div>
            <button @click="clearSelection" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-8 text-gray-400">Loading...</div>

      <template v-else>
        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="card lg:col-span-2">
            <h3 class="text-sm font-semibold text-gray-700 mb-4">Monthly Cost Trend</h3>
            <v-chart v-if="costHistory.length > 0" :option="trendChartOption" style="height: 300px" autoresize />
            <p v-else class="text-sm text-gray-400 text-center py-8">No cost data available</p>
          </div>
          <div class="card">
            <h3 class="text-sm font-semibold text-gray-700 mb-4">
              Service Breakdown
              <span v-if="store.selectedMonth" class="text-xs font-normal text-gray-400">({{ store.selectedMonth }})</span>
            </h3>
            <v-chart v-if="serviceBreakdown.length > 0" :option="pieChartOption" style="height: 300px" autoresize />
            <p v-else class="text-sm text-gray-400 text-center py-8">No data for this month</p>
          </div>
        </div>

        <!-- Monthly Cost Table -->
        <div class="card">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Monthly Cost History</h3>
          <div class="overflow-x-auto">
            <table v-if="costHistory.length > 0" class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="text-left py-2 px-2 font-medium text-gray-500">Month</th>
                  <th class="text-right py-2 px-2 font-medium text-gray-500">Cost</th>
                  <th class="text-right py-2 px-2 font-medium text-gray-500">vs Previous</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in costHistory" :key="row.period" class="border-b border-gray-50">
                  <td class="py-2 px-2 text-gray-700">{{ row.period }}</td>
                  <td class="py-2 px-2 text-right font-mono">{{ formatCurrency(row.amount) }}</td>
                  <td class="py-2 px-2 text-right">
                    <span
                      v-if="idx > 0"
                      class="text-xs"
                      :class="row.amount - costHistory[idx - 1].amount >= 0 ? 'text-red-500' : 'text-green-500'"
                    >
                      {{ row.amount - costHistory[idx - 1].amount >= 0 ? '+' : '' }}{{ formatCurrency(row.amount - costHistory[idx - 1].amount) }}
                      <template v-if="costHistory[idx - 1].amount > 0">
                        ({{ (((row.amount - costHistory[idx - 1].amount) / costHistory[idx - 1].amount) * 100).toFixed(1) }}%)
                      </template>
                    </span>
                    <span v-else class="text-xs text-gray-300">-</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t border-gray-200">
                  <td class="py-2 px-2 font-semibold text-gray-700">Total</td>
                  <td class="py-2 px-2 text-right font-mono font-semibold text-gray-700">{{ formatCurrency(totalCost) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <p v-else class="text-sm text-gray-400 text-center py-4">No cost data available</p>
          </div>
        </div>

        <!-- Service Breakdown Table -->
        <div v-if="serviceBreakdown.length > 0" class="card mt-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">
            Service Details
            <span v-if="store.selectedMonth" class="text-xs font-normal text-gray-400">({{ store.selectedMonth }})</span>
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="text-left py-2 px-2 font-medium text-gray-500">Service</th>
                  <th class="text-right py-2 px-2 font-medium text-gray-500">Cost</th>
                  <th class="text-right py-2 px-2 font-medium text-gray-500">%</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in serviceBreakdown" :key="s.name" class="border-b border-gray-50">
                  <td class="py-2 px-2 text-gray-700">{{ s.name }}</td>
                  <td class="py-2 px-2 text-right font-mono">{{ formatCurrency(s.amount) }}</td>
                  <td class="py-2 px-2 text-right text-gray-500">{{ s.percentage.toFixed(1) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
