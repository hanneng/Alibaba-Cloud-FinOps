<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { useAppStore } from '@/stores/app';
import { budgetsApi } from '@/composables/useApi';
import type { Budget } from '@/types';
import { computed } from 'vue';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

const store = useAppStore();
const budgets = ref<Budget[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = ref({
  name: '',
  monthlyLimit: 0,
  color: '#3B82F6',
  tagRules: [{ key: '', value: '' }] as Array<{ key: string; value: string }>,
});

const barOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 20, right: 20, top: 20, bottom: 30, containLabel: true },
  xAxis: {
    type: 'category',
    data: budgets.value.map((b) => b.name),
    axisLabel: { fontSize: 11 },
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Budget Limit',
      type: 'bar',
      data: budgets.value.map((b) => parseFloat(b.monthlyLimit)),
      itemStyle: { color: '#E5E7EB', borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 40,
      barGap: '-100%',
    },
    {
      name: 'Actual Spend',
      type: 'bar',
      data: budgets.value.map((b) => b.currentSpend || 0),
      itemStyle: {
        color: (params: { dataIndex: number }) => {
          const b = budgets.value[params.dataIndex];
          if (!b) return '#3B82F6';
          const pct = b.utilizationPct || 0;
          if (pct > 90) return '#EF4444';
          if (pct > 70) return '#F59E0B';
          return b.color || '#3B82F6';
        },
        borderRadius: [4, 4, 0, 0],
      },
      barMaxWidth: 40,
    },
  ],
}));

function formatCurrency(val: number | string): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(num);
}

function progressColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

async function loadBudgets() {
  loading.value = true;
  try {
    const { data } = await budgetsApi.list(store.selectedMonth || undefined);
    budgets.value = data;
  } catch (e) {
    console.error('Failed to load budgets:', e);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingId.value = null;
  form.value = { name: '', monthlyLimit: 0, color: '#3B82F6', tagRules: [{ key: '', value: '' }] };
  showForm.value = true;
}

function openEditForm(budget: Budget) {
  editingId.value = budget.id;
  form.value = {
    name: budget.name,
    monthlyLimit: parseFloat(budget.monthlyLimit),
    color: budget.color,
    tagRules: budget.tagRules.length > 0 ? [...budget.tagRules] : [{ key: '', value: '' }],
  };
  showForm.value = true;
}

function addTagRule() {
  form.value.tagRules.push({ key: '', value: '' });
}

function removeTagRule(idx: number) {
  form.value.tagRules.splice(idx, 1);
}

async function saveBudget() {
  const validRules = form.value.tagRules.filter((r) => r.key && r.value);
  const data = {
    name: form.value.name,
    monthlyLimit: form.value.monthlyLimit,
    color: form.value.color,
    tagRules: validRules,
  };

  if (editingId.value) {
    await budgetsApi.update(editingId.value, data);
  } else {
    await budgetsApi.create(data);
  }
  showForm.value = false;
  await loadBudgets();
}

async function deleteBudget(id: string) {
  if (confirm('Delete this budget?')) {
    await budgetsApi.delete(id);
    await loadBudgets();
  }
}

onMounted(async () => {
  await store.fetchMonths();
  await loadBudgets();
});

watch(() => store.selectedMonth, loadBudgets);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Budgets</h1>
        <p class="text-sm text-gray-500 mt-1">Set budgets and track spending by tags</p>
      </div>
      <div class="flex items-center gap-3">
        <select v-model="store.selectedMonth" class="select w-40">
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
        <button class="btn-primary text-sm" @click="openCreateForm">+ New Budget</button>
      </div>
    </div>

    <!-- Form Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="showForm = false">
      <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          {{ editingId ? 'Edit Budget' : 'Create Budget' }}
        </h3>
        <div class="space-y-4">
          <div>
            <label class="text-sm text-gray-600 block mb-1">Budget Name</label>
            <input v-model="form.name" class="input" placeholder="e.g. Engineering, Marketing" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-600 block mb-1">Monthly Limit (CNY)</label>
              <input v-model.number="form.monthlyLimit" type="number" class="input" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">Color</label>
              <input v-model="form.color" type="color" class="input h-10 p-1" />
            </div>
          </div>
          <div>
            <label class="text-sm text-gray-600 block mb-2">Tag Rules</label>
            <div v-for="(rule, idx) in form.tagRules" :key="idx" class="flex gap-2 mb-2">
              <input v-model="rule.key" class="input flex-1" placeholder="Tag key (e.g. department)" />
              <input v-model="rule.value" class="input flex-1" placeholder="Tag value (e.g. engineering)" />
              <button
                v-if="form.tagRules.length > 1"
                class="text-red-400 hover:text-red-600 px-2"
                @click="removeTagRule(idx)"
              >&times;</button>
            </div>
            <button class="text-sm text-primary-600 hover:text-primary-700" @click="addTagRule">
              + Add tag rule
            </button>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="btn-secondary text-sm" @click="showForm = false">Cancel</button>
          <button class="btn-primary text-sm" @click="saveBudget">
            {{ editingId ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Budget Chart -->
    <div v-if="budgets.length > 0" class="card mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Budget vs Actual</h3>
      <v-chart :option="barOption" style="height: 280px" autoresize />
    </div>

    <!-- Budget Cards -->
    <div v-if="loading" class="text-center py-8 text-gray-400">Loading...</div>
    <div v-else-if="budgets.length === 0" class="card text-center py-12">
      <svg class="mx-auto w-12 h-12 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <p class="text-gray-500 mb-4">No budgets configured</p>
      <button class="btn-primary text-sm" @click="openCreateForm">Create Your First Budget</button>
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="budget in budgets"
        :key="budget.id"
        class="card relative"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: budget.color }"></div>
            <h4 class="font-semibold text-gray-800">{{ budget.name }}</h4>
          </div>
          <div class="flex gap-2">
            <button class="text-gray-400 hover:text-gray-600 text-xs" @click="openEditForm(budget)">Edit</button>
            <button class="text-red-400 hover:text-red-600 text-xs" @click="deleteBudget(budget.id)">Delete</button>
          </div>
        </div>

        <div class="flex justify-between text-sm mb-2">
          <span class="text-gray-500">{{ formatCurrency(budget.currentSpend || 0) }} spent</span>
          <span class="text-gray-400">of {{ formatCurrency(budget.monthlyLimit) }}</span>
        </div>

        <!-- Progress Bar -->
        <div class="w-full bg-gray-100 rounded-full h-3 mb-3">
          <div
            class="h-3 rounded-full transition-all"
            :class="progressColor(budget.utilizationPct || 0)"
            :style="{ width: Math.min(budget.utilizationPct || 0, 100) + '%' }"
          ></div>
        </div>

        <div class="flex justify-between text-xs text-gray-400">
          <span>{{ (budget.utilizationPct || 0).toFixed(1) }}% utilized</span>
          <span :class="(budget.utilizationPct || 0) > 90 ? 'text-red-500 font-medium' : ''">
            {{ formatCurrency(Math.max(parseFloat(budget.monthlyLimit) - (budget.currentSpend || 0), 0)) }} remaining
          </span>
        </div>

        <!-- Tag Rules -->
        <div v-if="budget.tagRules && budget.tagRules.length > 0" class="mt-3 pt-3 border-t border-gray-100">
          <div class="flex flex-wrap gap-1">
            <span
              v-for="(rule, idx) in budget.tagRules"
              :key="idx"
              class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
            >
              {{ rule.key }}: {{ rule.value }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
