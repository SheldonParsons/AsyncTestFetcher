<script setup lang="ts">
import { computed, ref } from 'vue'
const props = defineProps<{ label: string; value: { body: string; encoding: string; state: string; bytes: number; contentType: string; message: string } }>()
const pretty = ref(false)
const content = computed(() => {
  if (!pretty.value || props.value.encoding !== 'text' || props.value.state !== 'complete') return props.value.body
  try { return JSON.stringify(JSON.parse(props.value.body), null, 2) } catch { return props.value.body }
})
const empty = computed(() => props.value.state === 'reading' || props.value.state === 'pending' ? '等待采集正文…' : props.value.state === 'none' ? '无请求正文。' : props.value.state === 'complete' ? '正文为空。' : '没有可展示的正文。')
</script>
<template>
  <section class="capture-detail-section">
    <div class="capture-response-heading"><span>{{ label }}{{ value.encoding === 'base64' ? ' · Base64' : '' }} · {{ (value.bytes / 1024).toFixed(1) }} KiB</span><button v-if="value.encoding === 'text' && value.state === 'complete' && value.body" type="button" :aria-pressed="pretty" @click="pretty = !pretty">{{ pretty ? '原文' : '格式化' }}</button></div>
    <p v-if="value.contentType" class="capture-content-type">{{ value.contentType }}</p>
    <p v-if="value.message" class="capture-response-note">{{ value.message }}</p>
    <pre v-if="content" class="capture-body" tabindex="0">{{ content }}</pre>
    <p v-else class="capture-response-note">{{ empty }}</p>
  </section>
</template>
