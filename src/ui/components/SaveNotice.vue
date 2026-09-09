<script setup lang="ts">
import { ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import AppIcon from './AppIcon.vue'

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <ToastProvider :duration="2000" label="提示" disable-swipe>
    <ToastRoot v-model:open="open" class="status-toast">
      <AppIcon name="check" :size="15" />
      <ToastTitle>服务配置已保存</ToastTitle>
    </ToastRoot>
    <ToastViewport class="status-viewport" label="提示" />
  </ToastProvider>
</template>
