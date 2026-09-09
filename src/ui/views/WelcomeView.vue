<script setup lang="ts">
import { ref } from 'vue'
import type { ServiceConfig } from '../../settings/service'
import AppIcon from '../components/AppIcon.vue'
import ServiceSummary from '../components/ServiceSummary.vue'
import FetcherMark from '../components/FetcherMark.vue'

defineProps<{ service: ServiceConfig | null; loading: boolean }>()
defineEmits<{ login: []; configure: [] }>()
const logoHovered = ref(false)
</script>

<template>
  <section class="welcome-view" aria-labelledby="welcome-title">
    <div class="welcome-art" aria-hidden="true">
      <div class="art-grid"></div>
      <div class="logo-tile" @pointerenter="logoHovered = true" @pointerleave="logoHovered = false" @pointercancel="logoHovered = false"><FetcherMark class="welcome-mark" :active="logoHovered" /></div>
      <span class="art-caption">ASYNCTEST / FETCHER</span>
    </div>
    <div class="welcome-copy">
      <span class="eyebrow">浏览器里的捕获与记录助手</span>
      <h1 id="welcome-title" tabindex="-1">捕获此刻。<br /><span>留住有用的细节。</span></h1>
      <p class="description">从页面到交互，从画面到细节，<br />让浏览中的发现，有迹可循。</p>
    </div>
    <div class="welcome-actions">
      <button class="button primary" type="button" :disabled="loading" @click="$emit('login')">
        {{ loading ? '正在读取配置…' : '登录 AsyncTest' }}<AppIcon name="arrowRight" />
      </button>
      <ServiceSummary :service="service" @configure="$emit('configure')" />
    </div>
  </section>
</template>
