import type { Metric } from 'web-vitals'

type Measurement = {
  id: string
  name: Metric['name']
  value: number
  sequence: number
  navigationType: Metric['navigationType']
}
type Listener = (metric: Metric) => void
const listeners = new Set<Listener>()
let loading: Promise<void> | undefined
// The library owns document-lifetime observers. Register once, even with multiple
// SDK instances; removing a listener stops all uploads for that instance.
function observe() {
  return (loading ??= import('web-vitals')
    .then((library) => {
      if (!listeners.size) {
        loading = undefined
        return
      }
      const report = (metric: Metric) => {
        for (const listener of listeners) listener(metric)
      }
      library.onLCP(report)
      library.onINP(report)
      library.onCLS(report)
      library.onFCP(report)
      library.onTTFB(report)
    })
    .catch(() => {
      loading = undefined
    }))
}
function documentPath() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    return new URL(navigation?.name || location.href).pathname.slice(0, 2048)
  } catch {
    return location.pathname.slice(0, 2048) || '/'
  }
}
export class BrowserWebVitals {
  private stopped = false
  private path = documentPath()
  private timestamp = new Date(performance.timeOrigin || Date.now()).toISOString()
  private metrics = new Map<
    string,
    { sequence: number; value: number; path: string; timestamp: string }
  >()
  constructor(
    private send: (metric: Measurement, path: string, timestamp: string) => Promise<void>
  ) {
    listeners.add(this.report)
    window.addEventListener('pageshow', this.onPageShow)
    void observe()
  }
  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      this.path = location.pathname.slice(0, 2048) || '/'
      this.timestamp = new Date().toISOString()
    }
  }
  private report = (metric: Metric) => {
    if (
      this.stopped ||
      metric.navigationType === 'soft-navigation' ||
      !Number.isFinite(metric.value) ||
      metric.value < 0
    )
      return
    const key = `${metric.name}:${metric.id}`
    const previous = this.metrics.get(key)
    if (
      previous?.value === metric.value ||
      (previous?.sequence ?? 0) >= 10000 ||
      (!previous && this.metrics.size >= 500)
    )
      return
    const state = {
      sequence: (previous?.sequence ?? 0) + 1,
      value: metric.value,
      path: previous?.path ?? this.path,
      timestamp: previous?.timestamp ?? this.timestamp,
    }
    this.metrics.set(key, state)
    // Never send entries/attribution: they may contain DOM text, URLs or selectors.
    void this.send(
      {
        id: metric.id,
        name: metric.name,
        value: metric.value,
        sequence: state.sequence,
        navigationType: metric.navigationType,
      },
      state.path,
      state.timestamp
    ).catch(() => {})
  }
  stop() {
    this.stopped = true
    listeners.delete(this.report)
    window.removeEventListener('pageshow', this.onPageShow)
    this.metrics.clear()
  }
}
