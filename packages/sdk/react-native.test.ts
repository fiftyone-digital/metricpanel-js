import { describe, expect, it, vi } from 'vitest'
import { createMetricPanelNative, type MetricPanelNativeStorage } from './react-native'

function createStorage(initial: Record<string, string> = {}): MetricPanelNativeStorage {
  const values = new Map(Object.entries(initial))

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

describe('MetricPanelNativeSDK', () => {
  it('tracks screen views without browser globals', async () => {
    const requests: Array<{ input: string; body: any; headers: Record<string, string> }> = []
    const fetch = vi.fn(async (input: string, init: any) => {
      requests.push({
        input,
        body: JSON.parse(init.body),
        headers: init.headers,
      })
      return { ok: true, status: 202 }
    })

    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api/',
      apiToken: 'token_123',
      storage: createStorage({
        mtrk_native_vid: 'visitor_123',
        mtrk_native_sid: 'session_123',
      }),
      fetch,
      platform: 'ios',
      os: 'iOS',
      screenWidth: 390,
      screenHeight: 844,
      defaultProperties: {
        app_version: '1.2.3',
      },
    })

    await metricpanel.screen('Checkout Success', {
      properties: { plan: 'pro' },
      utm: { source: 'newsletter' },
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.input).toBe('https://api.example.com/api/events')
    expect(requests[0]?.headers.Authorization).toBe('Bearer token_123')
    expect(requests[0]?.body).toMatchObject({
      websiteId: 'web_123',
      visitorId: 'visitor_123',
      sessionId: 'session_123',
      type: 'pageview',
      path: '/screen/checkout-success',
      title: 'Checkout Success',
      screenWidth: 390,
      screenHeight: 844,
      device: 'mobile',
      browser: 'React Native',
      os: 'iOS',
      utm: { source: 'newsletter' },
      properties: {
        app_version: '1.2.3',
        platform: 'ios',
        app_user_agent: null,
        plan: 'pro',
      },
      _privacyMode: {
        cookieless: false,
        disableGeo: false,
        anonymizeIP: false,
      },
    })
  })

  it('persists generated identity when storage is provided', async () => {
    const storage = createStorage()
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }))
    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api',
      storage,
      fetch,
    })

    await metricpanel.event('signup_started')

    expect(storage.setItem).toHaveBeenCalledWith('mtrk_native_vid', expect.any(String))
    expect(storage.setItem).toHaveBeenCalledWith('mtrk_native_sid', expect.any(String))
    expect(metricpanel.getVisitorId()).toEqual(expect.any(String))
    expect(metricpanel.getSessionId()).toEqual(expect.any(String))
  })

  it('throws when ingestion rejects the event', async () => {
    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api',
      visitorId: 'visitor_123',
      sessionId: 'session_123',
      fetch: vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'invalid token',
      })),
    })

    await expect(metricpanel.event('signup_started')).rejects.toThrow(
      'MetricPanel native event ingestion failed with 401: invalid token'
    )
  })

  it('limits custom event properties to ten fields', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }))
    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api',
      visitorId: 'visitor_123',
      sessionId: 'session_123',
      fetch,
    })

    await metricpanel.event(
      'many_props',
      Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`prop_${index}`, index]))
    )

    const body = JSON.parse(fetch.mock.calls[0]?.[1].body)
    expect(Object.keys(body.properties)).toHaveLength(10)
    expect(body.properties.prop_0).toBe(0)
    expect(body.properties.prop_11).toBeUndefined()
  })

  it('validates goals, limits custom properties, and preserves the explicit value', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }))
    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api',
      visitorId: 'visitor_123',
      sessionId: 'session_123',
      fetch,
    })

    await expect(metricpanel.goal({ name: '', value: 100 })).rejects.toThrow(
      'Goal name is required'
    )
    await expect(metricpanel.goal({ name: 'signup', value: -1 })).rejects.toThrow(
      'Goal value must be a non-negative integer'
    )
    await expect(metricpanel.goal({ name: 'signup', value: 10.5 })).rejects.toThrow(
      'Goal value must be a non-negative integer'
    )
    expect(fetch).not.toHaveBeenCalled()

    await metricpanel.goal({
      name: ' sales_qualified_lead ',
      value: 25000,
      properties: {
        value: 1,
        ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`prop_${index}`, index])),
      },
    })

    const body = JSON.parse(fetch.mock.calls[0]?.[1].body)
    expect(body).toMatchObject({
      type: 'goal',
      name: 'sales_qualified_lead',
      properties: { value: 25000, prop_0: 0 },
    })
    expect(Object.keys(body.properties)).toHaveLength(11)
    expect(body.properties.prop_11).toBeUndefined()
  })

  it('validates and normalizes revenue before transport', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }))
    const metricpanel = createMetricPanelNative({
      websiteId: 'web_123',
      apiUrl: 'https://api.example.com/api',
      visitorId: 'visitor_123',
      sessionId: 'session_123',
      fetch,
    })

    await expect(metricpanel.revenue({ amount: Number.NaN })).rejects.toThrow(
      'Revenue amount must be a positive integer'
    )
    await expect(metricpanel.revenue({ amount: 100, currency: 'USDD' })).rejects.toThrow(
      'Revenue currency must be a three-letter ISO code'
    )
    expect(fetch).not.toHaveBeenCalled()

    await metricpanel.revenue({ amount: 2500, currency: 'EUR' })
    const body = JSON.parse(fetch.mock.calls[0]?.[1].body)
    expect(body).toMatchObject({ type: 'revenue', amount: 2500, currency: 'eur' })
  })
})
