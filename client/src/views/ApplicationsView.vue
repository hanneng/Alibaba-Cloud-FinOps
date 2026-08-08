<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { useAppStore } from '@/stores/app';
import { groupsApi, resourcesApi } from '@/composables/useApi';
import type { ResourceGroup, ResourceGroupMember, GroupCostTrend, ResourceInfo } from '@/types';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent]);

const store = useAppStore();
const groups = ref<ResourceGroup[]>([]);
const groupTrends = ref<GroupCostTrend[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const expandedGroup = ref<string | null>(null);
const groupMembers = ref<Record<string, ResourceGroupMember[]>>({});
const form = ref({ name: '', color: '#3B82F6' });

// Resource search for adding members
const memberSearch = ref('');
const memberSearchResults = ref<ResourceInfo[]>([]);
const pendingResources = ref<string[]>([]);
let memberSearchTimeout: ReturnType<typeof setTimeout> | null = null;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(val);
}

async function loadData() {
  loading.value = true;
  try {
    const [groupsRes, trendsRes] = await Promise.all([
      groupsApi.list(store.selectedMonth || undefined),
      groupsApi.trend(),
    ]);
    groups.value = groupsRes.data;
    groupTrends.value = trendsRes.data;
  } catch (e) {
    console.error('Load groups error:', e);
  } finally {
    loading.value = false;
  }
}

async function expandGroup(groupId: string) {
  if (expandedGroup.value === groupId) {
    expandedGroup.value = null;
    return;
  }
  expandedGroup.value = groupId;
  if (!groupMembers.value[groupId]) {
    try {
      const { data } = await groupsApi.members(groupId, store.selectedMonth || undefined);
      groupMembers.value[groupId] = data;
    } catch (e) {
      console.error('Load members error:', e);
    }
  }
}

function openCreateForm() {
  editingId.value = null;
  form.value = { name: '', color: '#3B82F6' };
  pendingResources.value = [];
  memberSearchResults.value = [];
  memberSearch.value = '';
  showForm.value = true;
}

function openEditForm(group: ResourceGroup) {
  editingId.value = group.id;
  form.value = { name: group.name, color: group.color };
  pendingResources.value = [];
  memberSearchResults.value = [];
  memberSearch.value = '';
  showForm.value = true;
  // Load existing members to show them
  loadFormMembers(group.id);
}

async function loadFormMembers(groupId: string) {
  try {
    const { data } = await groupsApi.members(groupId);
    pendingResources.value = data.map((m: ResourceGroupMember) => m.resourceName);
  } catch (e) {
    console.error('Load form members error:', e);
  }
}

function searchResources() {
  if (memberSearchTimeout) clearTimeout(memberSearchTimeout);
  memberSearchTimeout = setTimeout(async () => {
    if (!memberSearch.value.trim()) {
      memberSearchResults.value = [];
      return;
    }
    try {
      const { data } = await resourcesApi.search(memberSearch.value);
      // Filter out already-added resources
      const existing = new Set(pendingResources.value);
      memberSearchResults.value = data.filter(
        (r: ResourceInfo) => !existing.has(r.instanceId || r.resourceName || '')
      );
    } catch (e) {
      console.error('Search resources error:', e);
    }
  }, 300);
}

function addResource(resource: ResourceInfo) {
  const id = resource.instanceId || resource.resourceName || '';
  if (id && !pendingResources.value.includes(id)) {
    pendingResources.value.push(id);
  }
  memberSearchResults.value = [];
  memberSearch.value = '';
}

function removePendingResource(id: string) {
  pendingResources.value = pendingResources.value.filter((r) => r !== id);
}

async function saveGroup() {
  if (!form.value.name.trim()) return;

  try {
    if (editingId.value) {
      await groupsApi.update(editingId.value, {
        name: form.value.name,
        color: form.value.color,
      });
      // Update members: add new ones
      const existingMembers = groupMembers.value[editingId.value] || [];
      const existingNames = new Set(existingMembers.map((m) => m.resourceName));
      const newResources = pendingResources.value.filter((r) => !existingNames.has(r));
      if (newResources.length > 0) {
        await groupsApi.addMembers(editingId.value, newResources);
      }
    } else {
      const { data: newGroup } = await groupsApi.create({
        name: form.value.name,
        color: form.value.color,
      });
      if (pendingResources.value.length > 0) {
        await groupsApi.addMembers(newGroup.id, pendingResources.value);
      }
    }
    showForm.value = false;
    await loadData();
    // Clear expanded group cache so it reloads
    if (editingId.value) {
      delete groupMembers.value[editingId.value];
    }
  } catch (e) {
    console.error('Save group error:', e);
  }
}

async function deleteGroup(id: string) {
  if (confirm('Delete this application group and all its members?')) {
    try {
      await groupsApi.delete(id);
      if (expandedGroup.value === id) expandedGroup.value = null;
      delete groupMembers.value[id];
      await loadData();
    } catch (e) {
      console.error('Delete group error:', e);
    }
  }
}

async function removeMember(groupId: string, memberId: string) {
  try {
    await groupsApi.removeMember(groupId, memberId);
    // Reload members
    const { data } = await groupsApi.members(groupId, store.selectedMonth || undefined);
    groupMembers.value[groupId] = data;
    await loadData();
  } catch (e) {
    console.error('Remove member error:', e);
  }
}

// Stacked bar chart for group cost trends
const trendChartOption = computed(() => {
  if (groupTrends.value.length === 0) return {};

  const periods = new Set<string>();
  for (const gt of groupTrends.value) {
    for (const t of gt.trend) periods.add(t.period);
  }
  const sortedPeriods = Array.from(periods).sort();

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: groupTrends.value.map((g) => g.name),
      bottom: 0,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 20, right: 20, top: 20, bottom: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: sortedPeriods,
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value' },
    series: groupTrends.value.map((gt) => ({
      name: gt.name,
      type: 'bar',
      stack: 'total',
      data: sortedPeriods.map((p) => {
        const point = gt.trend.find((t) => t.period === p);
        return point ? point.amount : 0;
      }),
      itemStyle: { color: gt.color, borderRadius: [0, 0, 0, 0] },
      barMaxWidth: 48,
    })),
  };
});

const totalGroupCost = computed(() => {
  return groups.value.reduce((sum, g) => sum + (g.currentCost || 0), 0);
});

onMounted(async () => {
  await store.fetchMonths();
  await loadData();
});

watch(() => store.selectedMonth, async () => {
  groupMembers.value = {};
  expandedGroup.value = null;
  await loadData();
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Application Groups</h1>
        <p class="text-sm text-gray-500 mt-1">Tag resources into groups and track application costs</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-600">Billing Month</label>
        <select v-model="store.selectedMonth" class="select w-40">
          <option v-for="m in store.availableMonths" :key="m" :value="m">{{ m }}</option>
        </select>
        <button class="btn-primary text-sm" @click="openCreateForm">+ New Group</button>
      </div>
    </div>

    <!-- Cost Summary Chart -->
    <div v-if="groupTrends.length > 0 && groupTrends.some(g => g.trend.some(t => t.amount > 0))" class="card mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Application Cost Trend</h3>
      <v-chart :option="trendChartOption" style="height: 300px" autoresize />
    </div>

    <!-- Summary Stats -->
    <div v-if="groups.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="card">
        <p class="text-xs text-gray-500 mb-1">Total Groups</p>
        <p class="text-2xl font-bold text-gray-900">{{ groups.length }}</p>
      </div>
      <div class="card">
        <p class="text-xs text-gray-500 mb-1">Total Resources Tagged</p>
        <p class="text-2xl font-bold text-gray-900">{{ groups.reduce((s, g) => s + g.memberCount, 0) }}</p>
      </div>
      <div class="card">
        <p class="text-xs text-gray-500 mb-1">
          Grouped Cost
          <span v-if="store.selectedMonth" class="text-gray-400">({{ store.selectedMonth }})</span>
        </p>
        <p class="text-2xl font-bold text-primary-700">{{ formatCurrency(totalGroupCost) }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8 text-gray-400">Loading...</div>

    <!-- Empty State -->
    <div v-else-if="groups.length === 0" class="card text-center py-12">
      <svg class="mx-auto w-12 h-12 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <p class="text-gray-500 mb-4">No application groups configured</p>
      <button class="btn-primary text-sm" @click="openCreateForm">Create Your First Group</button>
    </div>

    <!-- Group Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="group in groups"
        :key="group.id"
        class="card relative"
        :class="{ 'ring-2 ring-primary-300': expandedGroup === group.id }"
      >
        <div class="flex items-center justify-between mb-3 cursor-pointer" @click="expandGroup(group.id)">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: group.color }"></div>
            <h4 class="font-semibold text-gray-800">{{ group.name }}</h4>
          </div>
          <div class="flex items-center gap-3">
            <button class="text-gray-400 hover:text-gray-600 text-xs" @click.stop="openEditForm(group)">Edit</button>
            <button class="text-red-400 hover:text-red-600 text-xs" @click.stop="deleteGroup(group.id)">Delete</button>
            <svg class="w-4 h-4 text-gray-400 transition-transform" :class="{ 'rotate-180': expandedGroup === group.id }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div class="flex justify-between text-sm mb-1">
          <span class="text-gray-500">{{ group.memberCount }} resource{{ group.memberCount !== 1 ? 's' : '' }}</span>
          <span class="font-medium text-gray-700">{{ formatCurrency(group.currentCost || 0) }}</span>
        </div>

        <div class="w-full bg-gray-100 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all"
            :style="{
              backgroundColor: group.color,
              width: totalGroupCost > 0 ? Math.min(((group.currentCost || 0) / totalGroupCost) * 100, 100) + '%' : '0%'
            }"
          ></div>
        </div>

        <!-- Expanded Members -->
        <div v-if="expandedGroup === group.id && groupMembers[group.id]" class="mt-4 pt-4 border-t border-gray-100">
          <h5 class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Members</h5>
          <div v-if="groupMembers[group.id].length === 0" class="text-sm text-gray-400 py-2">
            No resources assigned to this group
          </div>
          <div v-else class="space-y-2 max-h-60 overflow-y-auto">
            <div
              v-for="member in groupMembers[group.id]"
              :key="member.id"
              class="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50"
            >
              <span class="text-sm text-gray-700 truncate flex-1">{{ member.resourceName }}</span>
              <div class="flex items-center gap-3 ml-2">
                <span class="text-sm font-mono text-gray-600">{{ formatCurrency(member.cost || 0) }}</span>
                <button
                  class="text-red-400 hover:text-red-600"
                  @click="removeMember(group.id, member.id)"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="expandedGroup === group.id" class="mt-4 pt-4 border-t border-gray-100 text-center py-2 text-gray-400 text-sm">
          Loading members...
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="showForm = false">
      <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          {{ editingId ? 'Edit Application Group' : 'Create Application Group' }}
        </h3>
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2">
              <label class="text-sm text-gray-600 block mb-1">Group Name</label>
              <input v-model="form.name" class="input w-full" placeholder="e.g. SAP Production, E-Commerce" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">Color</label>
              <input v-model="form.color" type="color" class="input w-full h-10 p-1" />
            </div>
          </div>

          <!-- Resource Search -->
          <div>
            <label class="text-sm text-gray-600 block mb-1">Add Resources</label>
            <div class="relative">
              <input
                v-model="memberSearch"
                @input="searchResources"
                class="input w-full"
                placeholder="Search resources to add..."
              />
              <div
                v-if="memberSearchResults.length > 0"
                class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto"
              >
                <div
                  v-for="(r, i) in memberSearchResults"
                  :key="i"
                  class="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-b-0"
                  @click="addResource(r)"
                >
                  <span class="text-gray-700">{{ r.resourceName || r.instanceId || '-' }}</span>
                  <span class="text-gray-400 text-xs ml-2">{{ r.productName }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pending Resources -->
          <div v-if="pendingResources.length > 0">
            <label class="text-sm text-gray-600 block mb-1">
              Resources ({{ pendingResources.length }})
            </label>
            <div class="max-h-40 overflow-y-auto space-y-1">
              <div
                v-for="r in pendingResources"
                :key="r"
                class="flex items-center justify-between py-1 px-2 rounded bg-gray-50"
              >
                <span class="text-sm text-gray-700 truncate">{{ r }}</span>
                <button class="text-red-400 hover:text-red-600 ml-2" @click="removePendingResource(r)">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="btn-secondary text-sm" @click="showForm = false">Cancel</button>
          <button class="btn-primary text-sm" @click="saveGroup">
            {{ editingId ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
