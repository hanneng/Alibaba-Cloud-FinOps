import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Bill } from '@/types';
import { billsApi, costsApi } from '@/composables/useApi';

export const useAppStore = defineStore('app', () => {
  const bills = ref<Bill[]>([]);
  const availableMonths = ref<string[]>([]);
  const selectedMonth = ref<string>('');
  const loading = ref(false);

  async function fetchBills() {
    loading.value = true;
    try {
      const { data } = await billsApi.list();
      bills.value = data;
    } catch (error) {
      console.error('Failed to fetch bills:', error);
    } finally {
      loading.value = false;
    }
  }

  async function fetchMonths() {
    try {
      const { data } = await costsApi.months();
      console.log('API /costs/months response:', data);
      availableMonths.value = data;
      if (data.length > 0 && !selectedMonth.value) {
        selectedMonth.value = data[data.length - 1];
      }
    } catch (error) {
      console.error('Failed to fetch months:', error);
    }
  }

  async function deleteBill(id: string) {
    await billsApi.delete(id);
    await fetchBills();
    await fetchMonths();
  }

  return {
    bills,
    availableMonths,
    selectedMonth,
    loading,
    fetchBills,
    fetchMonths,
    deleteBill,
  };
});
