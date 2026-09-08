import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserEventRules, matchesRulePath, type BrowserEventRule } from './event-rules'
import { createMetricPanel, type MetricPanelSDK } from './index'

const click: BrowserEventRule = {
  id: 'click',
  kind: 'click',
  eventName: 'signup',
  path: '/pricing*',
  selector: '#signup',
}
const instances: Array<{ stop?: () => void; destroy?: () => void }> = []
let rules: BrowserEventRule[]
let bodies: Array<Record<string, unknown>>
let transport: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/pricing?private=secret')
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null })
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false })
  document.body.innerHTML =
    '<button id="signup"><span>Private label</span></button><form id="contact"><input name="email" value="private@example.test"></form>'
  rules = [click]
  bodies = []
  transport = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(null, { status: 202 })
    }
    return new Response(JSON.stringify({ version: 1, rules }))
  })
  vi.stubGlobal('fetch', transport)
})
afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.stop?.()
    instance.destroy?.()
  }
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const sdk = (
  config: Parameters<typeof createMetricPanel>[0] = { websiteId: 'site', eventRules: true }
) => {
  const instance = createMetricPanel(config)
  instances.push(instance)
  return instance
}
const flush = async (tracker: MetricPanelSDK) => {
  await tracker.previewEventRules()
  await Promise.resolve()
}
describe('consent-aware event rules', () => {
  it('is opt-in and never loads configuration before consent or when DNT is enabled', async () => {
    sdk({ websiteId: 'manual' })
    expect(transport).not.toHaveBeenCalled()
    const tracker = sdk({ websiteId: 'consent', eventRules: true, waitForConsent: true })
    document.querySelector('button')?.click()
    expect(await tracker.previewEventRules()).toEqual([])
    expect(transport).not.toHaveBeenCalled()
    await tracker.grantConsent()
    await flush(tracker)
    document.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(bodies.filter((body) => body.name === 'signup')).toHaveLength(1)
    tracker.revokeConsent()
    transport.mockClear()
    bodies = []
    document.querySelector('button')?.click()
    await vi.advanceTimersByTimeAsync(180000)
    expect(transport).not.toHaveBeenCalled()
    expect(bodies).toEqual([])
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' })
    sdk()
    expect(transport).not.toHaveBeenCalled()
  })
  it('delegates nested/dynamic clicks, deduplicates names and emits only rule metadata', async () => {
    rules.push({ ...click, id: 'duplicate', selector: 'button' })
    const tracker = sdk()
    await flush(tracker)
    document.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      name: 'signup',
      path: '/pricing',
      properties: { metricpanel_rule_id: 'click' },
    })
    expect(JSON.stringify(bodies[0]?.properties)).not.toMatch(/Private|secret|email/)
    document.body.innerHTML = '<button id="signup">New</button>'
    document.querySelector('button')?.click()
    expect(bodies).toHaveLength(2)
    tracker.destroy()
    document.querySelector('button')?.click()
    expect(bodies).toHaveLength(2)
  })
  it('tracks form attempts and explicit SPA pageviews without reading input values', async () => {
    rules = [
      {
        id: 'form',
        kind: 'submit',
        eventName: 'contact_attempt',
        path: '/*',
        selector: 'form#contact',
      },
      { id: 'page', kind: 'pageview', eventName: 'checkout_view', path: '/checkout' },
    ]
    const tracker = sdk()
    await flush(tracker)
    document
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(bodies[0]).toMatchObject({
      name: 'contact_attempt',
      properties: { metricpanel_rule_id: 'form' },
    })
    window.history.pushState({}, '', '/checkout?email=secret')
    await tracker.pageview()
    expect(bodies.map((body) => body.name ?? body.type)).toEqual([
      'contact_attempt',
      'pageview',
      'checkout_view',
    ])
    expect(bodies[2]?.properties).toEqual({ metricpanel_rule_id: 'page' })
  })
  it('preview sends no events, reports invalid selectors and refresh removes disabled rules', async () => {
    rules.push({ ...click, id: 'bad', eventName: 'bad', selector: '[' })
    const tracker = sdk()
    const preview = await tracker.previewEventRules()
    expect(preview).toMatchObject([
      { matches: 1, error: null },
      { matches: 0, error: 'Invalid CSS selector' },
    ])
    expect(bodies).toEqual([])
    rules = []
    await tracker.previewEventRules()
    document.querySelector('button')?.click()
    expect(bodies).toEqual([])
  })
  it('fails closed on malformed, oversized or failed refreshes', async () => {
    const tracker = sdk()
    await flush(tracker)
    for (const value of [
      { version: 2, rules },
      { version: 1, rules: [...rules, ...rules] },
      { version: 1, rules: [{ ...click, eventName: 'x'.repeat(600000) }] },
    ]) {
      transport.mockResolvedValueOnce(new Response(JSON.stringify(value)))
      await tracker.previewEventRules()
      document.querySelector('button')?.click()
      expect(bodies).toEqual([])
    }
    transport.mockRejectedValueOnce(new Error('offline'))
    expect(await tracker.previewEventRules()).toEqual([])
  })
  it('ignores a response arriving after stop and expires config in a background tab', async () => {
    const emit = vi.fn(async () => {})
    const controller = new BrowserEventRules('/rules', emit)
    instances.push(controller)
    await controller.ready
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await vi.advanceTimersByTimeAsync(120001)
    document.querySelector('button')?.click()
    expect(emit).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    let resolve!: (response: Response) => void
    transport.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done
      })
    )
    const refreshing = controller.refresh()
    controller.stop()
    resolve(new Response(JSON.stringify({ version: 1, rules })))
    await refreshing
    expect(controller.preview()).toEqual([])
  })
  it('does not replay an old pageview into a newly granted consent session', async () => {
    rules = [{ id: 'page', kind: 'pageview', eventName: 'pricing_visit', path: '/pricing' }]
    const tracker = sdk()
    await flush(tracker)
    let resolve!: (response: Response) => void
    transport.mockImplementationOnce((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Promise<Response>((done) => {
        resolve = done
      })
    })
    const pending = tracker.pageview()
    tracker.revokeConsent()
    await tracker.grantConsent()
    await flush(tracker)
    resolve(new Response(null, { status: 202 }))
    await pending
    expect(bodies.filter((body) => body.type === 'event')).toEqual([])
  })

  it('matches literal paths with bounded wildcard semantics, ignoring query and fragments', () => {
    expect(matchesRulePath('/a*b*c', '/abc?x=1')).toBe(true)
    expect(matchesRulePath('/abc*abc', '/abc')).toBe(false)
    expect(matchesRulePath('/a.b', '/axb')).toBe(false)
    expect(matchesRulePath('/*', '/anything/deep#fragment')).toBe(true)
  })
})
