import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetricPanel, METRICPANEL_API_URL } from './index'

type HappyDomWindow = Window & {
  happyDOM: {
    setURL(url: string): void
  }
}

function setUrl(url: string) {
  ;(window as unknown as HappyDomWindow).happyDOM.setURL(url)
}

function setReferrer(referrer: string) {
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    value: referrer,
  })
}

function clearCookies() {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=;max-age=0;path=/`
  }
}

function mockTransport(response: { ok: boolean; status: number } = { ok: true, status: 202 }) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: vi.fn(() => false),
  })
  return fetchMock
}

function requestBody(fetchMock: ReturnType<typeof mockTransport>, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body)) as Record<string, any>
}

describe('MetricPanel browser SDK', () => {
  beforeEach(() => {
    setUrl('https://customer.example/pricing?utm_source=newsletter')
    setReferrer('')
    localStorage.clear()
    sessionStorage.clear()
    clearCookies()
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses hosted ingestion by default and preserves an explicit proxy override', async () => {
    const fetchMock = mockTransport()

    await createMetricPanel({ websiteId: 'site_hosted' }).event('hosted')
    await createMetricPanel({ websiteId: 'site_proxy', apiUrl: '/analytics/api/' }).event('proxy')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${METRICPANEL_API_URL}/events`)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/analytics/api/events')
  })

  it('sends pageviews with browser, privacy, query, and campaign payload fields', async () => {
    const fetchMock = mockTransport()
    document.title = 'Pricing'

    await createMetricPanel({ websiteId: 'site_123' }).pageview()

    expect(requestBody(fetchMock)).toMatchObject({
      websiteId: 'site_123',
      type: 'pageview',
      path: '/pricing',
      hostname: 'customer.example',
      referrer: null,
      title: 'Pricing',
      query: { utm_source: 'newsletter' },
      utm: { source: 'newsletter' },
      _privacyMode: {
        cookieless: false,
        disableGeo: false,
        anonymizeIP: false,
      },
    })
  })

  it('captures DataFast source aliases and persists complete campaign attribution', async () => {
    setUrl(
      'https://customer.example/pricing?ref=twitter&utm_medium=social&utm_campaign=launch&utm_term=analytics&utm_content=hero'
    )
    const fetchMock = mockTransport()
    const metricpanel = createMetricPanel({ websiteId: 'site_campaign' })

    await metricpanel.pageview()
    window.history.pushState({}, '', '/checkout')
    await metricpanel.event('checkout_started')

    expect(requestBody(fetchMock, 0).utm).toEqual({
      source: 'twitter',
      medium: 'social',
      campaign: 'launch',
      term: 'analytics',
      content: 'hero',
    })
    expect(requestBody(fetchMock, 1).utm).toEqual(requestBody(fetchMock, 0).utm)
  })

  it('preserves the first external referrer across SDK instances in one session', async () => {
    const fetchMock = mockTransport()
    setReferrer('https://google.com/search?q=analytics')
    await createMetricPanel({ websiteId: 'site_referrer' }).pageview()

    setUrl('https://customer.example/checkout')
    setReferrer('https://customer.example/pricing')
    await createMetricPanel({ websiteId: 'site_referrer' }).pageview()

    expect(requestBody(fetchMock, 0).referrer).toBe('https://google.com/search?q=analytics')
    expect(requestBody(fetchMock, 1).referrer).toBe('https://google.com/search?q=analytics')
  })

  it('tracks SPA navigation manually and includes hash routes only when configured', async () => {
    const fetchMock = mockTransport()
    const pathnameRouter = createMetricPanel({ websiteId: 'site_path' })
    const hashRouter = createMetricPanel({ websiteId: 'site_hash', trackHashRoutes: true })

    window.history.pushState({}, '', '/account#billing')
    await pathnameRouter.pageview()
    await hashRouter.pageview()

    expect(requestBody(fetchMock, 0).path).toBe('/account')
    expect(requestBody(fetchMock, 1).path).toBe('/account#billing')
  })

  it('skips local traffic by default and allows an intentional localhost override', async () => {
    setUrl('http://localhost:3000/preview')
    const fetchMock = mockTransport()

    await createMetricPanel({ websiteId: 'site_local_off' }).pageview()
    await createMetricPanel({ websiteId: 'site_local_on', allowLocalhost: true }).pageview()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody(fetchMock).websiteId).toBe('site_local_on')
  })

  it('keeps cookieless identity ephemeral and respects Do Not Track', async () => {
    const fetchMock = mockTransport()
    const cookieless = createMetricPanel({
      websiteId: 'site_private',
      cookieless: true,
      anonymizeIP: true,
    })

    await cookieless.event('privacy_enabled')

    expect(document.cookie).not.toMatch(/metricpanel_visitor=[^;]/)
    expect(document.cookie).not.toMatch(/metricpanel_session=[^;]/)
    expect(document.cookie).not.toMatch(/mtrk_vid=[^;]/)
    expect(document.cookie).not.toMatch(/mtrk_sid=[^;]/)
    expect(requestBody(fetchMock)._privacyMode).toEqual({
      cookieless: true,
      disableGeo: true,
      anonymizeIP: true,
    })

    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: '1',
    })
    await createMetricPanel({ websiteId: 'site_dnt' }).event('blocked')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('queues for consent and removes website-scoped state when consent is revoked', async () => {
    const fetchMock = mockTransport()
    const metricpanel = createMetricPanel({ websiteId: 'site_consent', waitForConsent: true })

    await metricpanel.event('queued')
    expect(fetchMock).not.toHaveBeenCalled()

    await metricpanel.grantConsent()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('metricpanel_consent:site_consent')).toBe('granted')

    sessionStorage.setItem('metricpanel_attribution:site_consent', '{"source":"test"}')
    sessionStorage.setItem('metricpanel_referrer:site_consent', '{"referrer":"https://google.com"}')
    metricpanel.revokeConsent()

    expect(metricpanel.hasConsent()).toBe(false)
    expect(metricpanel.getVisitorId()).toBeNull()
    expect(metricpanel.getSessionId()).toBeNull()
    expect(localStorage.getItem('metricpanel_consent:site_consent')).toBeNull()
    expect(sessionStorage.getItem('metricpanel_attribution:site_consent')).toBeNull()
    expect(sessionStorage.getItem('metricpanel_referrer:site_consent')).toBeNull()
    expect(localStorage.getItem('mtrk_consent:site_consent')).toBeNull()
    expect(sessionStorage.getItem('mtrk_attr:site_consent')).toBeNull()
    expect(sessionStorage.getItem('mtrk_ref:site_consent')).toBeNull()
    expect(document.cookie).not.toMatch(/mtrk_vid=[^;]/)
    expect(document.cookie).not.toMatch(/mtrk_sid=[^;]/)
  })

  it('migrates legacy browser identity and website-scoped storage without splitting the visitor', async () => {
    setUrl('https://customer.example/pricing')
    const visitorId = '11111111111111111111111111111111'
    const sessionId = '22222222222222222222222222222222'
    const attribution = JSON.stringify({
      sessionId,
      attribution: { source: 'legacy-campaign' },
    })
    const referrer = JSON.stringify({
      sessionId,
      referrer: 'https://example.com/referral',
    })
    document.cookie = `mtrk_vid=${visitorId};path=/`
    document.cookie = `mtrk_sid=${sessionId};path=/`
    localStorage.setItem('mtrk_consent:site_migration', 'granted')
    sessionStorage.setItem('mtrk_attr:site_migration', attribution)
    sessionStorage.setItem('mtrk_ref:site_migration', referrer)
    const fetchMock = mockTransport()

    const metricpanel = createMetricPanel({
      websiteId: 'site_migration',
      waitForConsent: true,
    })
    await metricpanel.pageview()

    expect(requestBody(fetchMock)).toMatchObject({
      visitorId,
      sessionId,
      referrer: 'https://example.com/referral',
      utm: { source: 'legacy-campaign' },
    })
    expect(document.cookie).toContain(`metricpanel_visitor=${visitorId}`)
    expect(document.cookie).toContain(`metricpanel_session=${sessionId}`)
    expect(document.cookie).not.toMatch(/mtrk_vid=[^;]/)
    expect(document.cookie).not.toMatch(/mtrk_sid=[^;]/)
    expect(localStorage.getItem('metricpanel_consent:site_migration')).toBe('granted')
    expect(sessionStorage.getItem('metricpanel_attribution:site_migration')).toBe(attribution)
    expect(sessionStorage.getItem('metricpanel_referrer:site_migration')).toBe(referrer)
    expect(localStorage.getItem('mtrk_consent:site_migration')).toBeNull()
    expect(sessionStorage.getItem('mtrk_attr:site_migration')).toBeNull()
    expect(sessionStorage.getItem('mtrk_ref:site_migration')).toBeNull()
  })

  it('caps event properties and reports rejected ingestion without breaking the application', async () => {
    const onError = vi.fn()
    const fetchMock = mockTransport({ ok: false, status: 429 })
    const metricpanel = createMetricPanel({ websiteId: 'site_errors', onError })

    await expect(
      metricpanel.event(
        'many_properties',
        Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`property_${index}`, index]))
      )
    ).resolves.toBeUndefined()

    expect(Object.keys(requestBody(fetchMock).properties)).toHaveLength(10)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'MetricPanel event ingestion failed with 429' })
    )
  })

  it('validates and normalizes revenue before transport', async () => {
    const fetchMock = mockTransport()
    const metricpanel = createMetricPanel({ websiteId: 'site_revenue' })

    await expect(metricpanel.revenue({ amount: 0 })).rejects.toThrow(
      'Revenue amount must be a positive integer'
    )
    await expect(metricpanel.revenue({ amount: 10.5 })).rejects.toThrow(
      'Revenue amount must be a positive integer'
    )
    await expect(metricpanel.revenue({ amount: 100, currency: 'US' })).rejects.toThrow(
      'Revenue currency must be a three-letter ISO code'
    )
    expect(fetchMock).not.toHaveBeenCalled()

    await metricpanel.revenue({ amount: 4900, currency: 'GBP' })
    expect(requestBody(fetchMock)).toMatchObject({
      type: 'revenue',
      amount: 4900,
      currency: 'gbp',
    })
  })

  it('validates required configuration and ignores calls after cleanup', async () => {
    expect(() => createMetricPanel({ websiteId: '' })).toThrow('websiteId is required')
    expect(() => createMetricPanel({ websiteId: 'site_123', apiUrl: '   ' })).toThrow(
      'apiUrl must be a non-empty URL or path'
    )

    const fetchMock = mockTransport()
    const metricpanel = createMetricPanel({ websiteId: 'site_cleanup' })
    metricpanel.destroy()
    await metricpanel.event('ignored')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(metricpanel.getVisitorId()).toBeNull()
    expect(metricpanel.getSessionId()).toBeNull()
  })
})
