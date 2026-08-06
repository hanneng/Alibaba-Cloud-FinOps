import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
    },
    {
      path: '/explorer',
      name: 'explorer',
      component: () => import('@/views/CostExplorerView.vue'),
    },
    {
      path: '/anomalies',
      name: 'anomalies',
      component: () => import('@/views/AnomaliesView.vue'),
    },
    {
      path: '/savings',
      name: 'savings',
      component: () => import('@/views/SavingsView.vue'),
    },
    {
      path: '/budgets',
      name: 'budgets',
      component: () => import('@/views/BudgetsView.vue'),
    },
  ],
});

export default router;
