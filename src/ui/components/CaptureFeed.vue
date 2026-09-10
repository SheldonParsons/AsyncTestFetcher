<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CAPTURE_LIMIT, type CaptureSnapshot, type CaptureDetail, type ResponseState } from '../../capture/contracts'
import AppIcon from './AppIcon.vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import CaptureBody from './CaptureBody.vue'
import CaptureHeaders from './CaptureHeaders.vue'

const props = defineProps<{ snapshot: CaptureSnapshot; detail: CaptureDetail | null }>()
const emit = defineEmits<{ retry: []; select: [id: number | null] }>()
const selected = ref<number | null>(null)
const states: Record<ResponseState, string> = { pending: '等待响应', reading: '读取中', complete: '完整', truncated: '已截断', unreadable: '不可读', failed: '失败', timeout: '超时' }
const formatTime = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour12: false })
const response = computed(() => props.detail?.id === selected.value ? props.detail.response : null)
const request = computed(() => props.detail?.id === selected.value ? props.detail.request : null)
const params = computed(() => {
  if (!request.value) return ''
  try {
    const pairs = [...new URL(request.value.url).searchParams.entries()]
    return pairs.length ? JSON.stringify(pairs.map(([name, value]) => ({ name, value })), null, 2) : ''
  } catch { return '' }
})
function toggle(id: number) {
  selected.value = selected.value === id ? null : id
  emit('select', selected.value)
}
watch(() => props.snapshot.rows, rows => {
  if (selected.value !== null && !rows.some(row => row.id === selected.value)) { selected.value = null; emit('select', null) }
})
</script>

<template>
  <section class="capture-feed" aria-label="最近捕获的 XHR 和 fetch 请求">
    <div class="capture-heading"><span>XHR / fetch</span><span class="capture-count">{{ snapshot.rows.length }} / {{ CAPTURE_LIMIT }}</span></div>
    <div class="capture-state" role="status"><i :class="{ live: snapshot.status === 'listening' }"></i>{{ snapshot.message || '准备监听…' }}</div>
    <button v-if="snapshot.status === 'error' || snapshot.status === 'interrupted'" class="inline-button" type="button" @click="emit('retry')">重试监听<AppIcon name="arrowRight" :size="14" /></button>
    <p v-if="!snapshot.rows.length && snapshot.status === 'listening'" class="capture-empty">等待当前页面发出请求…</p>
    <ol class="capture-list">
      <li v-for="row in snapshot.rows" :key="row.id" class="capture-row">
        <button class="capture-request" type="button" :aria-expanded="selected === row.id" :aria-controls="`response-${row.id}`" @click="toggle(row.id)">
          <span class="capture-meta"><span class="capture-method">{{ row.method }}</span><span>{{ row.type }}</span><span v-if="row.frame === 'iframe'">iframe</span><time>{{ formatTime(row.time) }}</time></span>
          <code class="capture-url" :title="row.url">{{ row.url }}</code>
          <span class="capture-response-state"><span v-if="row.response.status !== null">{{ row.response.status }} · </span>{{ states[row.response.state] }}<span class="capture-expand">{{ selected === row.id ? '收起' : '查看详情' }}</span></span>
        </button>
        <div v-if="selected === row.id" :id="`response-${row.id}`" class="capture-response">
          <TabsRoot v-if="request && response" default-value="request" class="capture-detail-tabs-root">
            <TabsList class="capture-detail-tabs" aria-label="接口详情">
              <TabsTrigger value="overview">URL / Params</TabsTrigger><TabsTrigger value="request">请求</TabsTrigger><TabsTrigger value="response">响应</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" class="capture-detail-tab">
              <section class="capture-detail-section">
                <div class="capture-response-heading">请求 URL</div>
                <p v-if="request.urlTruncated" class="capture-response-note">URL 超过采集上限，URL 和 Params 均不完整。</p>
                <pre class="capture-body" tabindex="0">{{ request.url }}</pre>
              </section>
              <section class="capture-detail-section">
                <div class="capture-response-heading">Params · URL 查询参数</div>
                <pre v-if="params" class="capture-body" tabindex="0">{{ params }}</pre>
                <p v-else class="capture-response-note">无查询参数。</p>
              </section>
            </TabsContent>
            <TabsContent value="request" class="capture-detail-tab">
              <CaptureHeaders label="请求 Headers" :value="request.headers" />
              <CaptureBody label="请求 Body" :value="request.body" />
            </TabsContent>
            <TabsContent value="response" class="capture-detail-tab">
              <p class="capture-response-note">HTTP {{ response.status ?? '—' }} {{ response.statusText }}</p>
              <CaptureHeaders label="响应 Headers" :value="response.headers" />
              <CaptureBody label="响应 Body" :value="response" />
            </TabsContent>
          </TabsRoot>
          <p v-else class="capture-response-note">正在读取…</p>
        </div>
      </li>
    </ol>
  </section>
</template>
