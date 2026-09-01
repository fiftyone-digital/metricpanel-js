import { describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'
import {
  AI_CRAWLERS,
  createExpressAICrawlerMiddleware,
  createMetricPanelAICrawl,
  detectAICrawler,
  getAICrawlerById,
  shouldTrackAICrawlerRequest,
  trackAICrawlerRequest,
  trackAICrawlerResponse,
  withAICrawlerTracking,
} from './index'

const BASE_CONFIG = {
  websiteId: 'site_public_id',
  token: 'mp_live_test-token',
}

function crawlerRequest(path = '/', userAgent = 'GPTBot/1.2', init: RequestInit = {}) {
  return new Request(`https://example.com${path}`, {
    ...init,
    headers: { 'user-agent': userAgent, ...init.headers },
  })
}

describe('AI crawler catalog', () => {
  it('covers the public comparison directory plus MetricPanel crawler extensions', () => {
    expect(AI_CRAWLERS).toHaveLength(69)
    expect(new Set(AI_CRAWLERS.map((crawler) => crawler.id)).size).toBe(AI_CRAWLERS.length)

    for (const token of [
      'OAI-AdsBot',
      'Google-NotebookLM',
      'MistralAI-User',
      'Amzn-SearchBot',
      'Grok-DeepSearch',
      'Kimi-SearchBot',
      'DeepSeekBot',
      'meta-webindexer',
    ]) {
      expect(detectAICrawler(token)?.name).toBe(token)
    }
    expect(detectAICrawler('Grok-DeepSearch/1.0')?.provider).toBe('SpaceXAI')
  })

  it('accepts current and unannounced SpaceXAI-prefixed user agents', () => {
    expect(detectAICrawler('SpaceXAI-SearchBot/1.0')?.id).toBe('xai-searchbot')
    expect(detectAICrawler('SpaceXAI-Bot/1.0')?.id).toBe('xai-bot')
    expect(detectAICrawler('SpaceXAI-Grok/1.0')?.id).toBe('xai-grok')
    expect(detectAICrawler('SpaceXAI-Web-Crawler/1.0')?.id).toBe('xai-web-crawler')

    const fallback = detectAICrawler('Mozilla/5.0 SpaceXAI-ResearchCrawler/1.0')
    expect(fallback).toMatchObject({
      id: 'spacexai-unknown',
      name: 'SpaceXAI crawler',
      provider: 'SpaceXAI',
      category: 'other',
    })
    expect(getAICrawlerById('spacexai-unknown')).toEqual(fallback)
  })

  it('uses the longest matching token before generic provider tokens', () => {
    expect(detectAICrawler('Mozilla/5.0 Grok-DeepSearch/1.0')?.id).toBe('grok-deepsearch')
    expect(detectAICrawler('Mozilla/5.0 Applebot-Extended/1.0')?.id).toBe('applebot-extended')
  })

  it('classifies answer, indexing, training, and other crawlers', () => {
    expect(detectAICrawler('ChatGPT-User/1.0')?.category).toBe('answer')
    expect(detectAICrawler('Googlebot/2.1')?.category).toBe('indexing')
    expect(detectAICrawler('GoogleOther/1.0')?.category).toBe('training')
    expect(detectAICrawler('FacebookBot/1.0')?.category).toBe('other')
  })

  it('does not classify normal browsers', () => {
    expect(detectAICrawler('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36')).toBeNull()
  })
})

describe('request filtering', () => {
  it('tracks GET and HEAD document requests by default', () => {
    const getDecision = shouldTrackAICrawlerRequest(crawlerRequest('/docs'), BASE_CONFIG)
    const headDecision = shouldTrackAICrawlerRequest(
      crawlerRequest('/docs', 'GPTBot/1.2', { method: 'HEAD' }),
      BASE_CONFIG
    )

    expect(getDecision).toMatchObject({ shouldTrack: true, crawler: { id: 'gptbot' } })
    expect(headDecision).toMatchObject({ shouldTrack: true, crawler: { id: 'gptbot' } })
  })

  it('filters methods, categories, assets, internals, and fetch destinations', () => {
    expect(
      shouldTrackAICrawlerRequest(
        crawlerRequest('/docs', 'GPTBot/1.2', { method: 'POST' }),
        BASE_CONFIG
      ).reason
    ).toBe('method_not_tracked')
    expect(
      shouldTrackAICrawlerRequest(crawlerRequest('/docs', 'GPTBot/1.2'), {
        ...BASE_CONFIG,
        disableTrainingCrawlers: true,
      }).reason
    ).toBe('category_skipped')
    expect(
      shouldTrackAICrawlerRequest(crawlerRequest('/docs', 'Googlebot/2.1'), {
        ...BASE_CONFIG,
        disableSearchCrawlers: true,
      }).reason
    ).toBe('search_crawler_skipped')
    expect(shouldTrackAICrawlerRequest(crawlerRequest('/logo.svg'), BASE_CONFIG).reason).toBe(
      'ignored_file_extension'
    )
    expect(shouldTrackAICrawlerRequest(crawlerRequest('/api/private'), BASE_CONFIG).reason).toBe(
      'ignored_path_prefix'
    )
    expect(
      shouldTrackAICrawlerRequest(
        crawlerRequest('/docs', 'GPTBot/1.2', {
          headers: { 'sec-fetch-dest': 'image' },
        }),
        BASE_CONFIG
      ).reason
    ).toBe('static_fetch_destination')
  })

  it.each(['/robots.txt', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/sitemaps/blog.xml'])(
    'keeps crawler-facing discovery resource %s trackable',
    (path) => {
      const decision = shouldTrackAICrawlerRequest(crawlerRequest(path), BASE_CONFIG)
      expect(decision).toMatchObject({ shouldTrack: true, crawler: { id: 'gptbot' } })
    }
  )

  it('supports custom methods, filters, public origins, and limits', () => {
    const request = new Request('http://internal:3000/private/report', {
      method: 'POST',
      headers: { 'user-agent': 'Claude-User/1.0' },
    })
    const accepted = shouldTrackAICrawlerRequest(request, {
      ...BASE_CONFIG,
      methods: ['POST'],
      publicOrigin: 'https://www.example.com/base-path',
      ignoredPathPrefixes: [],
      shouldTrackPath: (url, crawler) =>
        url.hostname === 'www.example.com' && crawler.id === 'claude-user',
    })
    expect(accepted.shouldTrack && accepted.url.href).toBe('https://www.example.com/private/report')

    expect(
      shouldTrackAICrawlerRequest(request, {
        ...BASE_CONFIG,
        methods: ['POST'],
        publicOrigin: 'https://www.example.com',
        maxUrlLength: 20,
      }).reason
    ).toBe('url_too_long')
  })
})

describe('tracking helpers', () => {
  it('sends only matched crawler requests and includes response metadata', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }))
    const tracker = createMetricPanelAICrawl({
      ...BASE_CONFIG,
      apiUrl: 'https://api.example.test/',
      fetch: fetcher,
    })

    const human = crawlerRequest('/pricing', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36')
    expect(await tracker.track(human)).toMatchObject({
      state: 'skipped',
      tracked: false,
      scheduled: false,
      reason: 'not_ai_crawler',
    })

    const crawler = crawlerRequest('/docs?source=chatgpt', 'ChatGPT-User/1.0', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    })
    expect(
      await tracker.track(
        crawler,
        new Response(null, { status: 404, headers: { 'content-type': 'text/html' } })
      )
    ).toMatchObject({
      state: 'tracked',
      tracked: true,
      scheduled: false,
      crawler: { id: 'chatgpt-user' },
      status: 202,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/ai-crawls',
      expect.objectContaining({ method: 'POST', keepalive: true })
    )
    const init = fetcher.mock.calls[0]?.[1]
    if (!init) throw new Error('Expected MetricPanel request options')
    expect(new Headers(init.headers).get('User-Agent')).toBe(
      `${packageJson.name}/${packageJson.version}`
    )
    expect(JSON.parse(String(init.body))).toMatchObject({
      websiteId: 'site_public_id',
      href: 'https://example.com/docs?source=chatgpt',
      method: 'GET',
      status: 404,
      contentType: 'text/html',
      ip: '203.0.113.10',
    })
  })

  it('hands request tracking to a platform waitUntil hook without waiting', async () => {
    const pending: Promise<unknown>[] = []
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }))
    const request = crawlerRequest('/')

    const result = trackAICrawlerRequest(
      request,
      { waitUntil: (promise) => pending.push(promise) },
      { ...BASE_CONFIG, fetch: fetcher }
    )

    expect(result).toMatchObject({
      state: 'scheduled',
      tracked: false,
      scheduled: true,
      crawler: { id: 'gptbot' },
    })
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('captures a final response status in the response helper', async () => {
    const pending: Promise<unknown>[] = []
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }))

    const result = trackAICrawlerResponse(
      crawlerRequest('/missing'),
      new Response(null, { status: 404 }),
      (promise) => pending.push(promise),
      { ...BASE_CONFIG, fetch: fetcher }
    )
    await Promise.all(pending)

    expect(result).toMatchObject({ state: 'scheduled', tracked: false, scheduled: true })
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.status).toBe(404)
  })

  it('distinguishes API failures from skipped and scheduled requests', async () => {
    const result = await trackAICrawlerRequest(crawlerRequest('/unavailable'), {
      ...BASE_CONFIG,
      fetch: async () => new Response(null, { status: 503 }),
    })

    expect(result).toMatchObject({
      state: 'failed',
      tracked: false,
      scheduled: false,
      reason: 'api_error',
      status: 503,
    })
  })

  it('returns an explicit scheduled result when the instance owns waitUntil', async () => {
    const pending: Promise<unknown>[] = []
    const tracker = createMetricPanelAICrawl({
      ...BASE_CONFIG,
      waitUntil: (promise) => pending.push(promise),
      fetch: async () => new Response(null, { status: 202 }),
    })

    await expect(tracker.track(crawlerRequest('/background'))).resolves.toMatchObject({
      state: 'scheduled',
      tracked: false,
      scheduled: true,
    })
    await Promise.all(pending)
  })

  it('does not mistake an arbitrary handler callback for a lifecycle waitUntil hook', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }))
    const callback = vi.fn()
    const wrapped = withAICrawlerTracking(
      async (request: Request, handlerCallback: () => void) => {
        expect(request).toBeInstanceOf(Request)
        expect(handlerCallback).toBe(callback)
        return new Response(null, { status: 204 })
      },
      { ...BASE_CONFIG, fetch: fetcher }
    )

    await expect(wrapped(crawlerRequest('/callback'), callback)).resolves.toMatchObject({
      status: 204,
    })
    expect(callback).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  })

  it('captures Express response status after finish and calls next immediately', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }))
    let finish: (() => void) | undefined
    const next = vi.fn()
    const middleware = createExpressAICrawlerMiddleware({ ...BASE_CONFIG, fetch: fetcher })

    middleware(
      {
        method: 'GET',
        originalUrl: '/article',
        protocol: 'https',
        headers: { host: 'example.com', 'user-agent': 'PerplexityBot/1.0' },
      },
      {
        statusCode: 503,
        once: (_event: string, callback: () => void) => {
          finish = callback
        },
      },
      next
    )

    expect(next).toHaveBeenCalledOnce()
    expect(fetcher).not.toHaveBeenCalled()
    finish?.()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).status).toBe(503)
  })

  it('rejects legacy token prefixes', () => {
    expect(() =>
      createMetricPanelAICrawl({
        websiteId: 'site_public_id',
        token: 'mtk_legacy-token',
      })
    ).toThrow('token must be a MetricPanel API token')
  })
})
