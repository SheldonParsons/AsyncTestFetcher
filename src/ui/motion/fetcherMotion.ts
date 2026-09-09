// Visual source: approved login-clear-spectrum-motion.html, 2026-09-09.
// Only the green bar receives the spectrum; the two black bars stay opaque black.
export const FETCHER_MOTION = { amplitude: 6, period: 2200, flowPeriod: 5600, glow: 0.24, settle: 260, enter: 160 } as const
type Pose = { x: number; y: number }
type Elements = {
  root: HTMLElement
  parts: SVGGElement[]
  sheen: SVGRectElement
  gradient: SVGLinearGradientElement
  aura: HTMLElement
}
const vectors = [[-.454, .891], [.454, .891], [.454, .891]] as const
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
const mix = (from: number, to: number, t: number) => from + (to - from) * t

export function createFetcherMotion(elements: Elements, initiallyReduced: boolean) {
  let phase: 'idle' | 'playing' | 'settling' = 'idle'
  let frame: number | null = null
  let disposed = false
  let reduced = initiallyReduced
  let phaseOrigin = 0
  let changedAt = 0
  let strength = 0
  let shift = 0
  let rotation = 0
  let poses: Pose[] = vectors.map(() => ({ x: 0, y: 0 }))
  let initial = { strength, shift, rotation, poses: poses.map(p => ({ ...p })) }

  function paint() {
    elements.root.dataset.motion = phase
    elements.parts.forEach((part, i) => { const pose = poses[i]!; part.setAttribute('transform', `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)})`) })
    elements.sheen.setAttribute('opacity', String(strength))
    elements.gradient.setAttribute('gradientTransform', `translate(${shift.toFixed(4)} 0)`)
    elements.aura.style.opacity = String(FETCHER_MOTION.glow * strength)
    elements.aura.style.transform = `rotate(${rotation.toFixed(2)}deg)`
  }

  function stopFrame() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }

  function rest() {
    phase = 'idle'
    strength = shift = rotation = 0
    poses = vectors.map(() => ({ x: 0, y: 0 }))
    stopFrame()
    paint()
  }

  function advance(now: number) {
    if (phase === 'playing') {
      const t = reduced ? 1 : smooth((now - changedAt) / FETCHER_MOTION.enter)
      const flow = reduced ? 0 : (now - phaseOrigin) / FETCHER_MOTION.flowPeriod
      strength = mix(initial.strength, 1, t)
      shift = mix(initial.shift, .65 * Math.sin(flow * Math.PI * 2), t)
      rotation = mix(initial.rotation, flow * 55, t)
      poses = vectors.map((vector, i) => {
        const wave = reduced ? 0 : Math.sin((now - phaseOrigin) / FETCHER_MOTION.period * Math.PI * 2 - i * 1.3)
        const from = initial.poses[i]!
        return { x: mix(from.x, wave * vector[0] * FETCHER_MOTION.amplitude, t), y: mix(from.y, wave * vector[1] * FETCHER_MOTION.amplitude, t) }
      })
    } else if (phase === 'settling') {
      const t = reduced ? 1 : smooth((now - changedAt) / FETCHER_MOTION.settle)
      strength = initial.strength * (1 - t)
      poses = initial.poses.map(p => ({ x: p.x * (1 - t), y: p.y * (1 - t) }))
      if (t === 1) { rest(); return }
    }
    paint()
  }

  function schedule() {
    if (disposed || frame !== null || phase === 'idle' || reduced) return
    frame = requestAnimationFrame(now => {
      frame = null
      if (disposed) return
      advance(now)
      schedule()
    })
  }

  function setActive(active: boolean) {
    if (disposed || (active && phase === 'playing') || (!active && phase !== 'playing')) return
    const now = performance.now()
    advance(now) // Re-entry starts at the currently rendered pose, never at a reset pose.
    initial = { strength, shift, rotation, poses: poses.map(p => ({ ...p })) }
    if (active && phase === 'idle') phaseOrigin = now
    changedAt = now
    phase = active ? 'playing' : 'settling'
    advance(now)
    schedule()
  }

  function setReduced(value: boolean) {
    if (disposed || value === reduced) return
    reduced = value
    if (reduced) {
      stopFrame()
      if (phase === 'settling') rest()
      else if (phase === 'playing') {
        poses = vectors.map(() => ({ x: 0, y: 0 }))
        strength = 1
        shift = rotation = 0
        paint()
      }
    } else if (phase === 'playing') {
      initial = { strength, shift, rotation, poses: poses.map(p => ({ ...p })) }
      changedAt = phaseOrigin = performance.now()
      schedule()
    }
  }

  paint()
  return { setActive, setReduced, dispose() { disposed = true; stopFrame() } }
}
