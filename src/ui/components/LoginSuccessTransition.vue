<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import FetcherMark from './FetcherMark.vue'
import { useReducedMotion } from '../motion/useReducedMotion'

const props = defineProps<{ runId: number }>()
const emit = defineEmits<{ complete: [runId: number] }>()
// Total from appearing to removal: 3000ms, including the 260ms reset and 280ms fade.
const DURATION = 3000
// Allow two frames of quiet rest before fading, so reset and fade don't overlap.
const SETTLE_AT = DURATION - 260 - 280 - 32
const FADE_AT = DURATION - 280
const active = ref(true)
const fading = ref(false)
const root = ref<HTMLElement>()
const reduced = useReducedMotion()
let started = 0
let finished = false
const timers: ReturnType<typeof setTimeout>[] = []

function clearTimers() { timers.forEach(clearTimeout); timers.length = 0 }
function sync() {
  if (finished) return
  clearTimers()
  const elapsed = performance.now() - started
  if (elapsed >= DURATION) {
    finished = true
    clearTimers()
    emit('complete', props.runId)
    return
  }
  active.value = elapsed < SETTLE_AT
  fading.value = elapsed >= FADE_AT
  const nextDeadline = active.value ? SETTLE_AT : fading.value ? DURATION : FADE_AT
  timers.push(setTimeout(sync, Math.max(1, Math.ceil(nextDeadline - elapsed))))
}

onMounted(() => {
  started = performance.now()
  root.value?.focus({ preventScroll: true })
  sync()
  document.addEventListener('visibilitychange', sync)
})
onBeforeUnmount(() => { finished = true; clearTimers(); document.removeEventListener('visibilitychange', sync) })
</script>

<template>
  <div ref="root" class="login-success-overlay" :class="{ 'is-fading': fading && !reduced }" :data-run="runId" tabindex="-1" role="status" aria-label="登录成功">
    <div class="login-success-content">
      <FetcherMark class="login-success-logo" :active="active" />
      <span class="login-success-brand">AsyncTest Fetcher</span>
    </div>
  </div>
</template>

<style scoped>
.login-success-overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: #fff; opacity: 1; outline: none; transition: opacity 280ms cubic-bezier(.22, 1, .36, 1); }
.login-success-content { display: flex; flex-direction: column; align-items: center; gap: 24px; transition: transform 280ms cubic-bezier(.22, 1, .36, 1); }
.login-success-logo { --mark-size: 90px; }
.login-success-brand { color: #555; font-size: 14px; font-weight: 500; letter-spacing: .035em; }
.login-success-overlay.is-fading { opacity: 0; }
.is-fading .login-success-content { transform: translateY(-6px); }
</style>
