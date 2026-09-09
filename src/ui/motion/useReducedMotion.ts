import { onBeforeUnmount, ref } from 'vue'

export function useReducedMotion() {
  const query = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)')
  const reduced = ref(query?.matches ?? false)
  const change = () => { reduced.value = query?.matches ?? false }
  query?.addEventListener('change', change)
  onBeforeUnmount(() => query?.removeEventListener('change', change))
  return reduced
}
