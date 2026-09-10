<script setup lang="ts">
import type { AuthState } from '../../auth/contracts'
import AppIcon from '../components/AppIcon.vue'
import PlatformPanel from './PlatformPanel.vue'

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
    <PlatformPanel v-else :key="state.user?.id" />
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </section>
</template>
