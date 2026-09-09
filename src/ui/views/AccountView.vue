<script setup lang="ts">
import type { AuthState } from '../../auth/contracts'
import AppIcon from '../components/AppIcon.vue'

defineProps<{ state: AuthState; busy: boolean; error: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="account-view" aria-labelledby="account-title">
    <div v-if="state.status === 'unverified'" class="account-notice">
      <h1 id="account-title" tabindex="-1">登录待验证</h1>
      <p>{{ state.message }}</p>
      <button class="inline-button" :disabled="busy" @click="$emit('retry')">重新验证<AppIcon name="arrowRight" :size="14" /></button>
    </div>
    <div v-else class="account-ready">
      <img src="/logo.svg" alt="" width="36" height="36" />
      <h1 id="account-title" tabindex="-1">捕获此刻，留住细节。</h1>
      <p>捕获功能即将开放。</p>
    </div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </section>
</template>
