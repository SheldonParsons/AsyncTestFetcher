<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { createFetcherMotion } from '../motion/fetcherMotion'
import { useReducedMotion } from '../motion/useReducedMotion'

const props = defineProps<{ active: boolean }>()
const gradientId = `fetcher-spectrum-${useId()}`
const root = ref<HTMLElement>()
const aura = ref<HTMLElement>()
const left = ref<SVGGElement>()
const middle = ref<SVGGElement>()
const right = ref<SVGGElement>()
const sheen = ref<SVGRectElement>()
const gradient = ref<SVGLinearGradientElement>()
const reduced = useReducedMotion()
let motion: ReturnType<typeof createFetcherMotion> | undefined

onMounted(() => {
  motion = createFetcherMotion({ root: root.value!, aura: aura.value!, parts: [left.value!, middle.value!, right.value!], sheen: sheen.value!, gradient: gradient.value! }, reduced.value)
  motion.setActive(props.active)
})
watch(() => props.active, active => motion?.setActive(active))
watch(reduced, value => motion?.setReduced(value))
onBeforeUnmount(() => motion?.dispose())
</script>

<template>
  <span ref="root" class="fetcher-mark" data-motion="idle" aria-hidden="true">
    <span ref="aura" class="fetcher-aura"></span>
    <svg class="fetcher-svg" viewBox="0 0 187 185" fill="none">
      <defs>
        <linearGradient ref="gradient" :id="gradientId" x1="0%" y1="0%" x2="100%" y2="35%" spreadMethod="reflect">
          <stop offset="0" stop-color="#70DDB7" />
          <stop offset=".16" stop-color="#80CDF2" />
          <stop offset=".31" stop-color="#B0A2F2" />
          <stop offset=".46" stop-color="#DDA7E8" />
          <stop offset=".61" stop-color="#F5ABC0" />
          <stop offset=".76" stop-color="#F8C68F" />
          <stop offset=".89" stop-color="#E6DD8D" />
          <stop offset="1" stop-color="#70DDB7" />
        </linearGradient>
      </defs>
      <g ref="left" data-part="0">
        <rect y="163.194" width="182.726" height="46.5564" rx="23.2782" transform="rotate(-63 0 163.194)" fill="#17B978" />
        <rect ref="sheen" data-sheen="0" y="163.194" width="182.726" height="46.5564" rx="23.2782" transform="rotate(-63 0 163.194)" :fill="`url(#${gradientId})`" opacity="0" />
      </g>
      <g ref="middle" data-part="1"><rect x="67.6995" y="71.0807" width="102.95" height="46.5564" rx="23.2782" transform="rotate(63 67.6995 71.0807)" fill="#000000" /></g>
      <g ref="right" data-part="2"><rect x="144.956" y="183.946" width="182.726" height="46.5564" rx="23.2782" transform="rotate(-117 144.956 183.946)" fill="#000000" /></g>
    </svg>
  </span>
</template>

<style scoped>
.fetcher-mark { position: relative; display: block; isolation: isolate; width: var(--mark-size, 90px); height: var(--mark-size, 90px); }
.fetcher-svg { position: relative; display: block; width: 100%; height: 100%; overflow: visible; }
.fetcher-aura { position: absolute; width: 166.6667%; height: 140%; top: -20%; left: -33.3333%; border-radius: 50%; background: conic-gradient(from 215deg, #15ae73, #258de0, #6847ef, #c520d9, #f13865, #ff922e, #c9bd13, #15ae73); filter: blur(calc(var(--mark-size, 90px) * .27777778)); opacity: 0; pointer-events: none; }
</style>
