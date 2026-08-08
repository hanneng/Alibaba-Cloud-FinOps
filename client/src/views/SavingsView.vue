<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useAppStore } from '@/stores/app';
import { savingsApi } from '@/composables/useApi';
import type { SavingsItem } from '@/types';

const store = useAppStore();
const activeTab = ref<'idle' | 'reserved_instance' | 'rightsizing'>('idle');
const idleResources = ref<SavingsItem[]>([]);
const riCandidates = ref<SavingsItem[]>([]);
const rightsizing = ref<SavingsItem[]>([]);
const loading = ref(false);

const activeData = computed(() => {
  switch (activeTab.value) {
    case 'idle': return idleResources.value;
    case 'reserved_instance': return riCandidates.value;
    case 'rightsizing': return rightsizing.value;
  }
});

const totalSavings = computed(() => {
  return [...idleResources.value, ...riCandidates.value, ...rightsizing.value]
    .reduce((sum, item) => sum + item.estimatedSavings, 0);
});

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2,
  }).format(val);
}

async function loadSavings() {
  if (!store.selectedMonth) return;
  loading.value = true;
  try {
    const [idle, ri, rs] = await Promise.all([
      savingsApi.idleResources(store.selectedMonth).then((r) => r.data),
      savingsApi.reservedInstances(store.selectedMonth).then((r) => r.data),
      savingsApi.rightsizing(store.selectedMonth).then((r) => r.data),
    ]);
    idleResources.value = idle;
    riCandidates.value = ri;
    rightsizing.value = rs;
  } catch (e) {
    console.error('Failed to load savings:', e);
  } finally {
    loading.value = false;
  }
}

function tabLabel(tab: string) {
  return {
    idle: 'Idle Resources',
    reserved_instance: 'RI Candidates',
    rightsizing: 'Rightsizing',
  }[tab];
}

onMounted(async () => {
  await store.fetchMonths();
  await loadSavings();
});

watch(() => store.selectedMonth, loadSavings);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Savings</h1>
        <p class="text-sm text-gray-500 mt-1">Identify cost optimization opportunities</p>
      </div>
      <select v-model="store.selectedMonth" class="select w-40">
        <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>

    <!-- Total Savings Card -->
    <div class="card mb-8 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-green-700">Total Estimated Monthly Savings</p>
          <p class="text-3xl font-bold text-green-800 mt-1">{{ formatCurrency(totalSavings) }}</p>
          <p class="text-xs text-green-600 mt-1">
            {{ idleResources.length + riCandidates.length + rightsizing.length }} opportunities found
          </p>
        </div>
        <div class="grid grid-cols-3 gap-6 text-center">
          <div>
            <p class="text-xl font-bold text-green-700">{{ idleResources.length }}</p>
            <p class="text-xs text-green-600">Idle</p>
          </div>
          <div>
            <p class="text-xl font-bold text-green-700">{{ riCandidates.length }}</p>
            <p class="text-xs text-green-600">RI Candidates</p>
          </div>
          <div>
            <p class="text-xl font-bold text-green-700">{{ rightsizing.length }}</p>
            <p class="text-xs text-green-600">Rightsizing</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
      <button
        v-for="tab in (['idle', 'reserved_instance', 'rightsizing'] as const)"
        :key="tab"
        @click="activeTab = tab"
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        :class="activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
      >
        {{ tabLabel(tab) }}
      </button>
    </div>

    <!-- Results -->
    <div class="card">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">
        {{ tabLabel(activeTab) }}
        <span class="text-gray-400 font-normal ml-2">({{ activeData.length }})</span>
      </h3>

      <div v-if="loading" class="text-center py-8 text-gray-400">Analyzing...</div>
      <div v-else-if="activeData.length === 0" class="text-center py-8 text-gray-400">
        No {{ tabLabel(activeTab).toLowerCase() }} found for this month
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="(item, idx) in activeData"
          :key="idx"
          class="flex items-start gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50"
        >
          <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            :class="{
              'bg-red-100': activeTab === 'idle',
              'bg-blue-100': activeTab === 'reserved_instance',
              'bg-amber-100': activeTab === 'rightsizing',
            }"
          >
            <svg class="w-5 h-5" :class="{
              'text-red-500': activeTab === 'idle',
              'text-blue-500': activeTab === 'reserved_instance',
              'text-amber-500': activeTab === 'rightsizing',
            }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-semibold text-gray-800">
                {{ item.resourceName || item.instanceId || item.productName }}
              </span>
              <span class="text-sm font-bold text-green-600">
                Save {{ formatCurrency(item.estimatedSavings) }}/mo
              </span>
            </div>
            <p class="text-sm text-gray-600">{{ item.recommendation }}</p>
            <div class="flex gap-4 mt-2 text-xs text-gray-400">
              <span v-if="item.productCode">{{ item.productCode }}</span>
              <span v-if="item.region">{{ item.region }}</span>
              <span>Current: {{ formatCurrency(item.currentCost) }}/mo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
