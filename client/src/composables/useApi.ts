import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Bills
export const billsApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/bills/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: () => api.get('/bills'),
  delete: (id: string) => api.delete(`/bills/${id}`),
};

// Costs
export const costsApi = {
  trend: (params?: { from?: string; to?: string; granularity?: string }) =>
    api.get('/costs/trend', { params }),
  byService: (month?: string) =>
    api.get('/costs/by-service', { params: { month } }),
  byRegion: (month?: string) =>
    api.get('/costs/by-region', { params: { month } }),
  bySubscriptionType: (month?: string) =>
    api.get('/costs/by-subscription-type', { params: { month } }),
  topResources: (month?: string, limit?: number) =>
    api.get('/costs/top-resources', { params: { month, limit } }),
  compare: (month1: string, month2: string) =>
    api.get('/costs/compare', { params: { month1, month2 } }),
  months: () => api.get('/costs/months'),
};

// Anomalies
export const anomaliesApi = {
  detect: (month: string) =>
    api.get('/anomalies', { params: { month } }),
  listRules: () => api.get('/anomalies/rules'),
  createRule: (data: { productCode?: string; thresholdPct: number; comparisonMode: string }) =>
    api.post('/anomalies/rules', data),
  updateRule: (id: string, data: { productCode?: string; thresholdPct: number; comparisonMode: string }) =>
    api.put(`/anomalies/rules/${id}`, data),
  deleteRule: (id: string) => api.delete(`/anomalies/rules/${id}`),
};

// Savings
export const savingsApi = {
  idleResources: (month: string) =>
    api.get('/savings/idle-resources', { params: { month } }),
  reservedInstances: (month: string) =>
    api.get('/savings/reserved-instances', { params: { month } }),
  rightsizing: (month: string) =>
    api.get('/savings/rightsizing', { params: { month } }),
};

// Budgets
export const budgetsApi = {
  list: (month?: string) => api.get('/budgets', { params: { month } }),
  create: (data: { name: string; monthlyLimit: number; tagRules: Array<{ key: string; value: string }>; color: string }) =>
    api.post('/budgets', data),
  update: (id: string, data: { name: string; monthlyLimit: number; tagRules: Array<{ key: string; value: string }>; color: string }) =>
    api.put(`/budgets/${id}`, data),
  delete: (id: string) => api.delete(`/budgets/${id}`),
  tagSummary: (month?: string) =>
    api.get('/budgets/tags/summary', { params: { month } }),
};

export default api;
