<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { billsApi } from '@/composables/useApi';
import type { Bill, UploadResult } from '@/types';

const store = useAppStore();
const dragging = ref(false);
const uploading = ref(false);
const uploadResult = ref<UploadResult | null>(null);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  dragging.value = true;
}

function handleDragLeave() {
  dragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  dragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    uploadFile(files[0]);
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    uploadFile(input.files[0]);
  }
}

async function uploadFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    error.value = 'Only CSV files are supported';
    return;
  }

  uploading.value = true;
  error.value = '';
  uploadResult.value = null;

  try {
    const { data } = await billsApi.upload(file);
    uploadResult.value = data;
    await store.fetchBills();
    await store.fetchMonths();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } };
    error.value = err.response?.data?.error || 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

async function deleteBill(id: string) {
  if (confirm('Delete this bill and all its line items?')) {
    await store.deleteBill(id);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(val: string | number, currency = 'CNY'): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num);
}

onMounted(() => {
  store.fetchBills();
});
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Upload Bills</h1>
      <p class="text-sm text-gray-500 mt-1">Upload Alibaba Cloud billing CSV files to analyze costs</p>
    </div>

    <!-- Upload Zone -->
    <div
      class="card mb-8"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div
        class="border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer"
        :class="dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'"
        @click="fileInput?.click()"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".csv"
          class="hidden"
          @change="handleFileSelect"
        />
        <svg class="mx-auto w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p v-if="!uploading" class="text-sm text-gray-600">
          Drag & drop your CSV file here, or <span class="text-primary-600 font-medium">click to browse</span>
        </p>
        <p v-else class="text-sm text-primary-600 font-medium">Uploading and parsing...</p>
        <p class="text-xs text-gray-400 mt-2">Supports Alibaba Cloud billing CSV (max 50MB)</p>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-sm text-red-700">{{ error }}</p>
    </div>

    <!-- Upload Result -->
    <div v-if="uploadResult" class="card mb-8 border-green-200 bg-green-50">
      <div class="flex items-start gap-3">
        <svg class="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-green-800">Successfully Imported</h3>
          <div class="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <p class="text-green-700">File: <span class="font-medium">{{ uploadResult.fileName }}</span></p>
            <p class="text-green-700">Billing Month: <span class="font-medium">{{ uploadResult.billingMonth }}</span></p>
            <p class="text-green-700">Total Amount: <span class="font-medium">{{ formatCurrency(uploadResult.totalAmount, uploadResult.currency) }}</span></p>
            <p class="text-green-700">Line Items: <span class="font-medium">{{ uploadResult.rowCount }}</span></p>
          </div>
          <p v-if="uploadResult.unmappedColumns.length > 0" class="text-xs text-green-600 mt-2">
            {{ uploadResult.unmappedColumns.length }} unmapped columns (stored in raw data)
          </p>
        </div>
      </div>
    </div>

    <!-- Bills List -->
    <div class="card">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">Uploaded Bills</h3>
      <div v-if="store.loading" class="text-center py-8 text-gray-400">Loading...</div>
      <div v-else-if="store.bills.length === 0" class="text-center py-8 text-gray-400">
        No bills uploaded yet. Upload your first CSV above.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left py-3 px-2 font-medium text-gray-500">Billing Month</th>
              <th class="text-left py-3 px-2 font-medium text-gray-500">File Name</th>
              <th class="text-right py-3 px-2 font-medium text-gray-500">Total Amount</th>
              <th class="text-right py-3 px-2 font-medium text-gray-500">Items</th>
              <th class="text-left py-3 px-2 font-medium text-gray-500">Uploaded</th>
              <th class="text-right py-3 px-2 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="bill in store.bills"
              :key="bill.id"
              class="border-b border-gray-50 hover:bg-gray-50"
            >
              <td class="py-3 px-2 font-medium text-gray-800">{{ bill.billingMonth }}</td>
              <td class="py-3 px-2 text-gray-600">{{ bill.fileName }}</td>
              <td class="py-3 px-2 text-right font-mono text-gray-800">
                {{ formatCurrency(bill.totalAmount, bill.currency) }}
              </td>
              <td class="py-3 px-2 text-right text-gray-600">{{ bill.lineItemCount || '-' }}</td>
              <td class="py-3 px-2 text-gray-500">{{ formatDate(bill.uploadedAt) }}</td>
              <td class="py-3 px-2 text-right">
                <button
                  class="text-red-500 hover:text-red-700 text-xs font-medium"
                  @click="deleteBill(bill.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
