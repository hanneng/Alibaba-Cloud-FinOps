<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { anomaliesApi } from '@/composables/useApi';
import type { Anomaly, AnomalyRule } from '@/types';

const store = useAppStore();
const anomalies = ref<Anomaly[]>([]);
const rules = ref<AnomalyRule[]>([]);
const loading = ref(false);
const showRuleForm = ref(false);
const newRule = ref({ productCode: '', thresholdPct: 30, comparisonMode: 'month_over_month' });

async function loadAnomalies() {
  if (!store.selectedMonth) return;
  loading.value = true;
  try {
    const { data } = await anomaliesApi.detect(store.selectedMonth);
    anomalies.value = data;
  } catch (e) {
    console.error('Failed to load anomalies:', e);
  } finally {
    loading.value = false;
  }
}

async function loadRules() {
  const { data } = await anomaliesApi.listRules();
  rules.value = data;
}

async function createRule() {
  await anomaliesApi.createRule({
    productCode: newRule.value.productCode || undefined,
    thresholdPct: newRule.value.thresholdPct,
    comparisonMode: newRule.value.comparisonMode,
  });
  showRuleForm.value = false;
  newRule.value = { productCode: '', thresholdPct: 30, comparisonMode: 'month_over_month' };
  await loadRules();
}

async function deleteRule(id: string) {
  await anomaliesApi.deleteRule(id);
  await loadRules();
}

function severityClass(severity: string) {
  return {
    high: 'badge-danger',
    medium: 'badge-warning',
    low: 'badge-info',
  }[severity] || 'badge-info';
}

function typeLabel(type: string) {
  return {
    month_over_month: 'MoM Change',
    rolling_avg: 'Rolling Avg',
    new_service: 'New Service',
    zero_to_nonzero: 'Zero to Non-Zero',
  }[type] || type;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(val);
}

onMounted(async () => {
  await store.fetchMonths();
  await Promise.all([loadAnomalies(), loadRules()]);
});

watch(() => store.selectedMonth, loadAnomalies);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Anomalies</h1>
        <p class="text-sm text-gray-500 mt-1">Detect unusual cost changes in your cloud spending</p>
      </div>
      <div class="flex items-center gap-3">
        <select v-model="store.selectedMonth" class="select w-40">
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-3 gap-4 mb-8">
      <div class="card text-center">
        <p class="card-title">Total Anomalies</p>
        <p class="card-value">{{ anomalies.length }}</p>
      </div>
      <div class="card text-center">
        <p class="card-title">High Severity</p>
        <p class="card-value text-red-600">{{ anomalies.filter(a => a.severity === 'high').length }}</p>
      </div>
      <div class="card text-center">
        <p class="card-title">Active Rules</p>
        <p class="card-value">{{ rules.length }}</p>
      </div>
    </div>

    <!-- Anomaly List -->
    <div class="card mb-8">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Detected Anomalies ({{ store.selectedMonth }})</h3>
      <div v-if="loading" class="text-center py-8 text-gray-400">Analyzing...</div>
      <div v-else-if="anomalies.length === 0" class="text-center py-8 text-gray-400">
        No anomalies detected for this month
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="(anomaly, idx) in anomalies"
          :key="idx"
          class="flex items-start gap-4 p-4 rounded-lg border"
          :class="{
            'border-red-200 bg-red-50': anomaly.severity === 'high',
            'border-yellow-200 bg-yellow-50': anomaly.severity === 'medium',
            'border-blue-200 bg-blue-50': anomaly.severity === 'low',
          }"
        >
          <div class="flex-shrink-0 mt-1">
            <span class="badge" :class="severityClass(anomaly.severity)">
              {{ anomaly.severity }}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold text-gray-800">{{ anomaly.productName }}</span>
              <span class="badge-info badge text-xs">{{ typeLabel(anomaly.type) }}</span>
            </div>
            <p class="text-sm text-gray-600">{{ anomaly.explanation }}</p>
            <div class="flex gap-6 mt-2 text-xs text-gray-500">
              <span>Current: <span class="font-medium text-gray-700">{{ formatCurrency(anomaly.currentAmount) }}</span></span>
              <span v-if="anomaly.previousAmount !== null">
                Previous: <span class="font-medium text-gray-700">{{ formatCurrency(anomaly.previousAmount) }}</span>
              </span>
              <span :class="anomaly.changePct >= 0 ? 'text-red-600' : 'text-green-600'">
                {{ anomaly.changePct >= 0 ? '+' : '' }}{{ anomaly.changePct.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rules Section -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-gray-700">Detection Rules</h3>
        <button class="btn-primary text-sm" @click="showRuleForm = !showRuleForm">
          {{ showRuleForm ? 'Cancel' : '+ Add Rule' }}
        </button>
      </div>

      <!-- Rule Form -->
      <div v-if="showRuleForm" class="bg-gray-50 rounded-lg p-4 mb-4">
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="text-xs text-gray-500 block mb-1">Product Code (optional)</label>
            <input v-model="newRule.productCode" class="input" placeholder="Leave empty for all" />
          </div>
          <div>
            <label class="text-xs text-gray-500 block mb-1">Threshold %</label>
            <input v-model.number="newRule.thresholdPct" type="number" class="input" />
          </div>
          <div>
            <label class="text-xs text-gray-500 block mb-1">Comparison Mode</label>
            <select v-model="newRule.comparisonMode" class="select">
              <option value="month_over_month">Month over Month</option>
              <option value="rolling_avg">Rolling Average</option>
            </select>
          </div>
        </div>
        <button class="btn-primary text-sm mt-3" @click="createRule">Save Rule</button>
      </div>

      <!-- Rules List -->
      <div v-if="rules.length === 0" class="text-sm text-gray-400 text-center py-4">
        No custom rules. Default threshold: 30% month-over-month
      </div>
      <div v-else class="space-y-2">
        <div v-for="rule in rules" :key="rule.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div class="text-sm">
            <span class="font-medium">{{ rule.productCode || 'All Services' }}</span>
            <span class="text-gray-400 mx-2">&middot;</span>
            <span>{{ rule.thresholdPct }}% threshold</span>
            <span class="text-gray-400 mx-2">&middot;</span>
            <span class="text-gray-500">{{ rule.comparisonMode }}</span>
          </div>
          <button class="text-red-500 hover:text-red-700 text-xs" @click="deleteRule(rule.id)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
