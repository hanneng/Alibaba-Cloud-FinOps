<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue';
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-50">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <router-view />
      </div>
    </main>
  </div>
</template>
