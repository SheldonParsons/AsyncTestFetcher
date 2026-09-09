<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ error: string; messageId: string; revision?: number }>(), { revision: 0 })
const control = ref<HTMLElement>()

watch(() => [props.error, props.revision], async () => {
  await nextTick()
  const element = control.value
  if (!element) return
  element.classList.remove('is-shaking')
  if (!props.error) return
  // Transitions.dev replay pattern: restart the short shake even for the same error.
  void element.offsetWidth
  element.classList.add('is-shaking')
}, { flush: 'post' })

function finishShake(event: AnimationEvent) {
  if (event.target === control.value) control.value?.classList.remove('is-shaking')
}
</script>

<template>
  <div class="input-feedback">
    <div ref="control" class="t-input" :class="{ 'is-error': error }" @animationend="finishShake"><slot /></div>
    <Transition name="field-message">
      <p v-if="error" :id="messageId" class="t-error-msg" role="alert">{{ error }}</p>
    </Transition>
  </div>
</template>

<style scoped>
/* Adapted from Transitions.dev — Error state shake.
 * https://transitions.dev/detail.html?t=error-state-shake
 * Licensed under https://transitions.dev/terms.html (Using the transitions).
 */
.input-feedback { min-width: 0; --shake-distance: 6px; --shake-overshoot: 4px; --shake-ease: cubic-bezier(.22, 1, .36, 1); }
.t-input :deep(input) { transition: border-color 150ms ease-out, background-color 150ms ease-out; }
.t-input.is-error :deep(input) { border-color: #c45d5d; background: #fffafa; transition-duration: 280ms; }
.t-input.is-error :deep(input:focus-visible) { outline-color: #d99a9a; }
.t-error-msg { margin: 7px 0 0; color: #b14d4d; font-size: 11px; line-height: 1.6; }
.field-message-enter-active, .field-message-leave-active { transition: opacity 280ms ease-out; }
.field-message-enter-from, .field-message-leave-to { opacity: 0; }
.t-input.is-shaking { animation: t-input-shake 280ms linear; }
@keyframes t-input-shake {
  0% { transform: translateX(0); animation-timing-function: var(--shake-ease); }
  28.57% { transform: translateX(var(--shake-distance)); animation-timing-function: var(--shake-ease); }
  57.14% { transform: translateX(calc(var(--shake-distance) * -1)); animation-timing-function: var(--shake-ease); }
  78.57% { transform: translateX(var(--shake-overshoot)); animation-timing-function: var(--shake-ease); }
  100% { transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .t-input { animation: none !important; transform: none !important; }
}
</style>
