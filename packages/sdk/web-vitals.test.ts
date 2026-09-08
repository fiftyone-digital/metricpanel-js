import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const collectors = vi.hoisted(() => ({ callbacks: [] as Array<(metric: unknown) => void> }))
vi.mock('web-vitals', () => {
  const register = (callback: (metric: unknown) => void) => collectors.callbacks.push(callback)
  return { onLCP: register, onINP: register, onCLS: register, onFCP: register, onTTFB: register }
})
const instances: Array<{ destroy(): void }> = []
beforeEach(() => {
  vi.resetModules()
  collectors.callbacks.length = 0
  window.history.replaceState({}, '', 'https://customer.example/pricing?private=secret')
  localStorage.clear()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  )
})
afterEach(() => {
  for (const instance of instances.splice(0)) instance.destroy()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const metric = {
  id: 'v6-example',
  name: 'LCP',
  value: 2400,
  navigationType: 'navigate',
  entries: [{ element: { textContent: 'private DOM content' } }],
}
const settle = async () => {
  await vi.waitFor(() => expect(collectors.callbacks.length).toBe(5))
}
it('is opt-in, starts after consent, sends bounded fields with stable document attribution, and deduplicates unchanged updates', async () => {
  const { createMetricPanel } = await import('./index')
  instances.push(createMetricPanel({ websiteId: 'default' }))
  expect(collectors.callbacks).toHaveLength(0)
  const sdk = createMetricPanel({ websiteId: 'site', webVitals: true, waitForConsent: true })
  instances.push(sdk)
  expect(collectors.callbacks).toHaveLength(0)
  await sdk.grantConsent()
  await settle()
  window.history.pushState({}, '', '/checkout?secret=x')
  collectors.callbacks[0]!(metric)
  collectors.callbacks[0]!(metric)
  collectors.callbacks[0]!({ ...metric, value: 2600 })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
  expect(bodies[0]).toMatchObject({
    type: 'web_vital',
    path: '/pricing',
    query: null,
    title: null,
    webVital: { id: metric.id, name: 'LCP', value: 2400, sequence: 1, navigationType: 'navigate' },
  })
  expect(bodies[1].webVital.sequence).toBe(2)
  expect(bodies[0].timestamp).toBe(bodies[1].timestamp)
  expect(bodies[0].webVital).not.toHaveProperty('entries')
  expect(JSON.stringify(bodies)).not.toContain('private DOM')
})
it('stops reports after revoke or destroy and never replays pre-revocation measurements after regrant', async () => {
  const { createMetricPanel } = await import('./index')
  const sdk = createMetricPanel({ websiteId: 'site', webVitals: true })
  instances.push(sdk)
  await settle()
  sdk.revokeConsent()
  await sdk.grantConsent()
  collectors.callbacks[0]!(metric)
  expect(fetch).not.toHaveBeenCalled()
  expect(collectors.callbacks).toHaveLength(5)
  sdk.destroy()
  collectors.callbacks[0]!({ ...metric, value: 3000 })
  expect(fetch).not.toHaveBeenCalled()
})
it('registers observers once for multiple instances and gives bfcache restores new document context', async () => {
  const { createMetricPanel } = await import('./index')
  const first = createMetricPanel({ websiteId: 'first', webVitals: true })
  instances.push(first)
  const second = createMetricPanel({ websiteId: 'second', webVitals: true })
  instances.push(second)
  await settle()
  first.destroy()
  window.history.pushState({}, '', '/restored')
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: true })
  window.dispatchEvent(event)
  collectors.callbacks[0]!({ ...metric, id: 'restore-id', navigationType: 'back-forward-cache' })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body))).toMatchObject({
    websiteId: 'second',
    path: '/restored',
  })
})
it('honors DNT and cancellation during lazy initialization', async () => {
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' })
  const { createMetricPanel } = await import('./index')
  instances.push(createMetricPanel({ websiteId: 'dnt', webVitals: true }))
  expect(collectors.callbacks).toHaveLength(0)
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null })
  const sdk = createMetricPanel({ websiteId: 'cancelled', webVitals: true })
  instances.push(sdk)
  sdk.destroy()
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(collectors.callbacks).toHaveLength(0)
})
