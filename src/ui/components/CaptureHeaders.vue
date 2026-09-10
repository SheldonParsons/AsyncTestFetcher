<script setup lang="ts">
import type { CapturedHeaders } from '../../capture/contracts'
defineProps<{ label: string; value: CapturedHeaders }>()
</script>
<template>
  <section class="capture-detail-section">
    <div class="capture-response-heading"><span>{{ label }} · {{ value.entries.length }}</span><span>{{ value.state === 'truncated' ? '已截断' : value.state === 'unreadable' ? '未完整读取' : '页面可见' }}</span></div>
    <p class="capture-response-note">{{ value.message }}</p>
    <div v-if="value.entries.length" class="capture-headers-list" tabindex="0">
      <div v-for="([name, headerValue], index) in value.entries" :key="index" class="capture-header-pair"><code>{{ name }}</code><pre>{{ headerValue }}</pre></div>
    </div>
    <p v-else class="capture-response-note">没有采集到可展示的 header。</p>
  </section>
</template>
