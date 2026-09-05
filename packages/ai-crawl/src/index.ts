export { AI_CRAWLERS, AI_CRAWLER_CATEGORY, detectAICrawler, getAICrawlerById } from './catalog'
export type { AICrawlerCategory, AICrawlerDefinition } from './catalog'

import packageJson from '../package.json'
import { detectAICrawler, type AICrawlerDefinition } from './catalog'

const DEFAULT_API_URL = 'https://api.metricpanel.io'
const DEFAULT_TIMEOUT_MS = 1_500
const DEFAULT_MAX_URL_LENGTH = 8_192
const API_TOKEN_PREFIX = 'mp_live_'
const PACKAGE_USER_AGENT = `${packageJson.name}/${packageJson.version}`
const DEFAULT_METHODS = ['GET', 'HEAD'] as const
const CLIENT_IP_HEADERS = [
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'true-client-ip',
  'fastly-client-ip',
  'fly-client-ip',
  'x-forwarded-for',
] as const
const DEFAULT_IGNORED_PATH_PREFIXES = [
  '/api',
  '/_next',
  '/_nuxt',
  '/_astro',
  '/static',
  '/assets',
  '/public',
  '/images',
  '/img',
  '/fonts',
  '/favicon',
  '/build',
  '/dist',
  '/admin',
  '/webhook',
  '/webhooks',
  '/cdn-cgi',
  '/.well-known',
] as const
const DEFAULT_IGNORED_EXTENSIONS = [
  'avif',
  'bmp',
  'br',
  'cjs',
  'css',
  'csv',
  'eot',
  'gif',
  'gz',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'json',
  'map',
  'mjs',
  'mov',
  'mp3',
  'mp4',
  'otf',
  'pdf',
  'png',
  'svg',
  'ttf',
  'txt',
  'wasm',
  'wav',
  'webm',
  'webmanifest',
  'webp',
  'woff',
  'woff2',
  'xml',
  'zip',
] as const
const STATIC_FETCH_DESTINATIONS = new Set([
  'audio',
  'embed',
  'font',
  'image',
  'manifest',
  'object',
  'script',
  'style',
  'track',
  'video',
  'worker',
])
const CRAWLER_FACING_EXACT_PATHS = new Set(['/robots.txt', '/llms.txt', '/llms-full.txt'])

export type MetricPanelAICrawlSkipReason =
  | 'disabled'
  | 'missing_website_id'
  | 'missing_token'
  | 'invalid_token'
  | 'method_not_tracked'
  | 'not_ai_crawler'
  | 'category_skipped'
  | 'search_crawler_skipped'
  | 'invalid_url'
  | 'url_too_long'
  | 'static_fetch_destination'
  | 'ignored_path_prefix'
  | 'ignored_file_extension'
  | 'path_rejected'

export type MetricPanelAICrawlFailureReason = 'api_error' | 'network_error'

export type MetricPanelAICrawlDecision =
  | {
      shouldTrack: false
      reason: MetricPanelAICrawlSkipReason
      crawler?: AICrawlerDefinition
      url?: never
    }
  | {
      shouldTrack: true
      crawler: AICrawlerDefinition
      url: URL
      reason?: never
    }

export type MetricPanelAICrawlResult =
  | {
      state: 'skipped'
      tracked: false
      scheduled: false
      reason: MetricPanelAICrawlSkipReason
      crawler?: AICrawlerDefinition
    }
  | {
      state: 'scheduled'
      tracked: false
      scheduled: true
      crawler: AICrawlerDefinition
    }
  | {
      state: 'tracked'
      tracked: true
      scheduled: false
      crawler: AICrawlerDefinition
      status: number
    }
  | {
      state: 'failed'
      tracked: false
      scheduled: false
      reason: MetricPanelAICrawlFailureReason
      crawler: AICrawlerDefinition
      status?: number
    }

export type MetricPanelAICrawlConfig = {
  websiteId: string
  token: string
  apiUrl?: string
  source?: string
  publicOrigin?: string
  enabled?: boolean
  disableAnswerFetch?: boolean
  disableSearchCrawlers?: boolean
  disableTrainingCrawlers?: boolean
  disableOtherCrawlers?: boolean
  methods?: readonly string[]
  getIp?: (request: Request) => string | null | undefined
  fetch?: typeof fetch
  waitUntil?: (promise: Promise<unknown>) => void
  timeoutMs?: number
  maxUrlLength?: number
  ignoredPathPrefixes?: readonly string[]
  additionalIgnoredPathPrefixes?: readonly string[]
  ignoredExtensions?: readonly string[]
  additionalIgnoredExtensions?: readonly string[]
  shouldTrackPath?: (url: URL, crawler: AICrawlerDefinition) => boolean
  onError?: (error: Error) => void
  debug?: boolean
}

export type AICrawlResponse =
  | Response
  | { status?: number | null; statusCode?: number | null; headers?: Headers }
  | undefined

export type MetricPanelWaitUntilContext = {
  waitUntil?: (promise: Promise<unknown>) => void
  response?: AICrawlResponse
  statusCode?: number | null
}

export type MetricPanelWaitUntilTarget =
  | MetricPanelWaitUntilContext
  | ((promise: Promise<unknown>) => void)
  | null
  | undefined

export type MetricPanelAICrawl = {
  track(request: Request, response?: AICrawlResponse): Promise<MetricPanelAICrawlResult>
  shouldTrack(request: Request): MetricPanelAICrawlDecision
  withHandler<T extends AICrawlResponse>(
    handler: (request: Request) => T | Promise<T>
  ): (request: Request) => Promise<T>
}

function required(value: string, name: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  return normalized.replace(/\/{2,}/g, '/').toLowerCase()
}

function pathStartsWith(pathname: string, prefix: string) {
  const normalizedPrefix = normalizePathname(prefix)
  return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`)
}

function isCrawlerFacingResourcePath(pathname: string) {
  const normalized = normalizePathname(pathname)
  const lastSegment = normalized.split('/').pop() ?? ''
  return (
    CRAWLER_FACING_EXACT_PATHS.has(normalized) ||
    ((normalized.startsWith('/sitemap/') || normalized.startsWith('/sitemaps/')) &&
      lastSegment.endsWith('.xml')) ||
    (lastSegment.includes('sitemap') && lastSegment.endsWith('.xml'))
  )
}

function getIgnoredPathPrefixes(config: MetricPanelAICrawlConfig) {
  return (
    config.ignoredPathPrefixes ?? [
      ...DEFAULT_IGNORED_PATH_PREFIXES,
      ...(config.additionalIgnoredPathPrefixes ?? []),
    ]
  )
}

function getIgnoredExtensions(config: MetricPanelAICrawlConfig) {
  const extensions = config.ignoredExtensions ?? [
    ...DEFAULT_IGNORED_EXTENSIONS,
    ...(config.additionalIgnoredExtensions ?? []),
  ]
  return new Set(extensions.map((extension) => extension.replace(/^\./, '').toLowerCase()))
}

function hasIgnoredExtension(pathname: string, extensions: Set<string>) {
  const lastSegment = pathname.split('/').pop() ?? ''
  const match = /\.([a-z0-9]+)$/i.exec(lastSegment)
  return Boolean(match?.[1] && extensions.has(match[1].toLowerCase()))
}

function shouldTrackCategory(crawler: AICrawlerDefinition, config: MetricPanelAICrawlConfig) {
  if (config.disableSearchCrawlers && crawler.category === 'indexing') {
    return false
  }
  if (config.disableAnswerFetch && crawler.category === 'answer') return false
  if (config.disableTrainingCrawlers && crawler.category === 'training') return false
  if (config.disableOtherCrawlers && crawler.category === 'other') return false
  return true
}

function getRequestUrl(request: Request, config: MetricPanelAICrawlConfig) {
  try {
    const requestUrl = new URL(request.url)
    if (!config.publicOrigin) return requestUrl

    const publicOrigin = new URL(config.publicOrigin)
    if (
      !['http:', 'https:'].includes(publicOrigin.protocol) ||
      publicOrigin.username ||
      publicOrigin.password
    ) {
      return null
    }
    const publicUrl = new URL(publicOrigin.origin)
    publicUrl.pathname = requestUrl.pathname
    publicUrl.search = requestUrl.search
    return publicUrl
  } catch {
    return null
  }
}

function normalizeIp(value: string | null | undefined) {
  const first = value?.split(',')[0]?.trim()
  if (!first) return undefined
  return first.startsWith('::ffff:') ? first.slice('::ffff:'.length) : first
}

function getRequestIp(request: Request, config: MetricPanelAICrawlConfig) {
  const customIp = config.getIp?.(request)
  if (customIp) return normalizeIp(customIp)
  for (const name of CLIENT_IP_HEADERS) {
    const value = normalizeIp(request.headers.get(name))
    if (value) return value
  }
  return undefined
}

function normalizeStatusCode(value: number | null | undefined) {
  if (!Number.isInteger(value) || !value || value < 100 || value > 599) return undefined
  return value
}

function getStatusCode(response?: AICrawlResponse, context?: MetricPanelWaitUntilContext) {
  return (
    normalizeStatusCode(context?.statusCode) ??
    normalizeStatusCode(response?.status) ??
    normalizeStatusCode(
      response && 'statusCode' in response ? response.statusCode : context?.response?.status
    )
  )
}

function getContentType(response?: AICrawlResponse) {
  return response?.headers?.get('content-type') ?? undefined
}

export function shouldTrackAICrawlerRequest(
  request: Request,
  config: MetricPanelAICrawlConfig
): MetricPanelAICrawlDecision {
  if (config.enabled === false) return { shouldTrack: false, reason: 'disabled' }
  if (!config.websiteId?.trim()) return { shouldTrack: false, reason: 'missing_website_id' }
  if (!config.token?.trim()) return { shouldTrack: false, reason: 'missing_token' }
  if (!config.token.trim().startsWith(API_TOKEN_PREFIX)) {
    return { shouldTrack: false, reason: 'invalid_token' }
  }

  const methods = (config.methods ?? DEFAULT_METHODS).map((method) => method.toUpperCase())
  if (!methods.includes(request.method.toUpperCase())) {
    return { shouldTrack: false, reason: 'method_not_tracked' }
  }

  const crawler = detectAICrawler(request.headers.get('user-agent'))
  if (!crawler) return { shouldTrack: false, reason: 'not_ai_crawler' }
  if (!shouldTrackCategory(crawler, config)) {
    return {
      shouldTrack: false,
      reason: crawler.category === 'indexing' ? 'search_crawler_skipped' : 'category_skipped',
      crawler,
    }
  }

  const url = getRequestUrl(request, config)
  if (!url || !['http:', 'https:'].includes(url.protocol)) {
    return { shouldTrack: false, reason: 'invalid_url', crawler }
  }
  if (url.href.length > (config.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH)) {
    return { shouldTrack: false, reason: 'url_too_long', crawler }
  }

  const fetchDestination = request.headers.get('sec-fetch-dest')?.toLowerCase() ?? ''
  if (STATIC_FETCH_DESTINATIONS.has(fetchDestination)) {
    return { shouldTrack: false, reason: 'static_fetch_destination', crawler }
  }

  const pathname = normalizePathname(url.pathname)
  const crawlerFacing = isCrawlerFacingResourcePath(pathname)
  if (
    !crawlerFacing &&
    getIgnoredPathPrefixes(config).some((prefix) => pathStartsWith(pathname, prefix))
  ) {
    return { shouldTrack: false, reason: 'ignored_path_prefix', crawler }
  }
  if (!crawlerFacing && hasIgnoredExtension(pathname, getIgnoredExtensions(config))) {
    return { shouldTrack: false, reason: 'ignored_file_extension', crawler }
  }
  if (config.shouldTrackPath) {
    try {
      if (!config.shouldTrackPath(url, crawler)) {
        return { shouldTrack: false, reason: 'path_rejected', crawler }
      }
    } catch {
      return { shouldTrack: false, reason: 'path_rejected', crawler }
    }
  }

  return { shouldTrack: true, crawler, url }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function getEndpoint(config: MetricPanelAICrawlConfig) {
  const configured = trimTrailingSlash(config.apiUrl?.trim() || DEFAULT_API_URL)
  return configured.endsWith('/ai-crawls') ? configured : `${configured}/ai-crawls`
}

function reportError(config: MetricPanelAICrawlConfig, error: unknown) {
  const normalized = error instanceof Error ? error : new Error(String(error))
  try {
    config.onError?.(normalized)
  } catch {
    // A consumer's error reporter must not break the host request or background task.
  }
  if (config.debug) console.warn('[MetricPanel] Failed to track AI crawler request', normalized)
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return fetcher(input, init)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

type SkippedDecision = Extract<MetricPanelAICrawlDecision, { shouldTrack: false }>
type TrackableDecision = Extract<MetricPanelAICrawlDecision, { shouldTrack: true }>

function skippedResult(decision: SkippedDecision): MetricPanelAICrawlResult {
  return {
    state: 'skipped',
    tracked: false,
    scheduled: false,
    reason: decision.reason,
    ...(decision.crawler ? { crawler: decision.crawler } : {}),
  }
}

function scheduledResult(decision: TrackableDecision): MetricPanelAICrawlResult {
  return {
    state: 'scheduled',
    tracked: false,
    scheduled: true,
    crawler: decision.crawler,
  }
}

async function sendAICrawlerRequest(
  request: Request,
  config: MetricPanelAICrawlConfig,
  decision: MetricPanelAICrawlDecision = shouldTrackAICrawlerRequest(request, config),
  response?: AICrawlResponse,
  context?: MetricPanelWaitUntilContext
): Promise<MetricPanelAICrawlResult> {
  if (!decision.shouldTrack) return skippedResult(decision)

  const fetcher = config.fetch ?? globalThis.fetch
  if (!fetcher) {
    return {
      state: 'failed',
      tracked: false,
      scheduled: false,
      reason: 'network_error',
      crawler: decision.crawler,
    }
  }

  try {
    const result = await fetchWithTimeout(
      fetcher,
      getEndpoint(config),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': PACKAGE_USER_AGENT,
        },
        keepalive: true,
        body: JSON.stringify({
          websiteId: config.websiteId.trim(),
          href: decision.url.href,
          method: request.method.toUpperCase(),
          userAgent: (request.headers.get('user-agent') ?? '').slice(0, 2_048),
          ip: getRequestIp(request, config),
          status: getStatusCode(response, context),
          contentType: getContentType(response),
          source: (config.source?.trim() || 'server_middleware').slice(0, 64),
          timestamp: new Date().toISOString(),
        }),
      },
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    )

    if (!result.ok) {
      reportError(
        config,
        new Error(`MetricPanel AI crawl ingestion failed with HTTP ${result.status}`)
      )
      return {
        state: 'failed',
        tracked: false,
        scheduled: false,
        reason: 'api_error',
        crawler: decision.crawler,
        status: result.status,
      }
    }
    return {
      state: 'tracked',
      tracked: true,
      scheduled: false,
      crawler: decision.crawler,
      status: result.status,
    }
  } catch (error) {
    reportError(config, error)
    return {
      state: 'failed',
      tracked: false,
      scheduled: false,
      reason: 'network_error',
      crawler: decision.crawler,
    }
  }
}

function scheduleWaitUntil(
  context: MetricPanelWaitUntilTarget,
  config: MetricPanelAICrawlConfig,
  promise: Promise<unknown>
) {
  const safePromise = promise.catch((error: unknown) => reportError(config, error))
  try {
    if (typeof context === 'function') return context(safePromise)
    if (context?.waitUntil) return context.waitUntil(safePromise)
    if (config.waitUntil) return config.waitUntil(safePromise)
  } catch (error) {
    reportError(config, error)
  }
  void safePromise
}

export function trackAICrawlerRequest(
  request: Request,
  config: MetricPanelAICrawlConfig
): Promise<MetricPanelAICrawlResult>
export function trackAICrawlerRequest(
  request: Request,
  context: MetricPanelWaitUntilTarget,
  config: MetricPanelAICrawlConfig
): MetricPanelAICrawlResult
export function trackAICrawlerRequest(
  request: Request,
  contextOrConfig: MetricPanelWaitUntilTarget | MetricPanelAICrawlConfig,
  maybeConfig?: MetricPanelAICrawlConfig
) {
  if (maybeConfig) {
    return trackAICrawlerRequestInBackground(
      request,
      contextOrConfig as MetricPanelWaitUntilTarget,
      maybeConfig
    )
  }
  return sendAICrawlerRequest(request, contextOrConfig as MetricPanelAICrawlConfig)
}

function trackAICrawlerRequestInBackground(
  request: Request,
  context: MetricPanelWaitUntilTarget,
  config: MetricPanelAICrawlConfig
): MetricPanelAICrawlResult {
  const decision = shouldTrackAICrawlerRequest(request, config)
  if (!decision.shouldTrack) return skippedResult(decision)

  const eventContext =
    context && typeof context === 'object' && 'waitUntil' in context ? context : undefined
  scheduleWaitUntil(
    context,
    config,
    sendAICrawlerRequest(request, config, decision, eventContext?.response, eventContext)
  )
  return scheduledResult(decision)
}

export function trackAICrawlerResponse(
  request: Request,
  response: AICrawlResponse,
  config: MetricPanelAICrawlConfig
): MetricPanelAICrawlResult
export function trackAICrawlerResponse(
  request: Request,
  response: AICrawlResponse,
  context: MetricPanelWaitUntilTarget,
  config: MetricPanelAICrawlConfig
): MetricPanelAICrawlResult
export function trackAICrawlerResponse(
  request: Request,
  response: AICrawlResponse,
  contextOrConfig: MetricPanelWaitUntilTarget | MetricPanelAICrawlConfig,
  maybeConfig?: MetricPanelAICrawlConfig
) {
  const config = maybeConfig ?? (contextOrConfig as MetricPanelAICrawlConfig)
  const context = maybeConfig ? (contextOrConfig as MetricPanelWaitUntilTarget) : config.waitUntil
  const decision = shouldTrackAICrawlerRequest(request, config)
  if (!decision.shouldTrack) return skippedResult(decision)

  scheduleWaitUntil(context, config, sendAICrawlerRequest(request, config, decision, response))
  return scheduledResult(decision)
}

function findWaitUntilTarget(args: unknown[]): MetricPanelWaitUntilTarget {
  return args.find(
    (argument) =>
      argument &&
      typeof argument === 'object' &&
      'waitUntil' in argument &&
      typeof argument.waitUntil === 'function'
  ) as MetricPanelWaitUntilTarget
}

export function withAICrawlerTracking<TArgs extends unknown[]>(
  handler: (request: Request, ...args: TArgs) => Response | Promise<Response>,
  config: MetricPanelAICrawlConfig
) {
  return async (request: Request, ...args: TArgs) => {
    const response = await handler(request, ...args)
    trackAICrawlerResponse(request, response, findWaitUntilTarget(args), config)
    return response
  }
}

export function createAICrawlerMiddleware(config: MetricPanelAICrawlConfig) {
  return (request: Request, context?: MetricPanelWaitUntilTarget) =>
    trackAICrawlerRequestInBackground(request, context, config)
}

type NodeRequestLike = {
  method?: string
  originalUrl?: string
  protocol?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: { encrypted?: boolean }
}

type NodeResponseLike = {
  statusCode?: number | null
  once?: (event: string, listener: () => void) => unknown
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function createRequestFromNodeRequest(request: NodeRequestLike) {
  const protocol =
    request.protocol ??
    firstHeaderValue(request.headers?.['x-forwarded-proto']) ??
    (request.socket?.encrypted ? 'https' : 'http')
  const host = firstHeaderValue(request.headers?.host) ?? 'localhost'
  const originalUrl = request.originalUrl ?? request.url ?? '/'
  const url = /^https?:\/\//i.test(originalUrl)
    ? originalUrl
    : `${protocol}://${host}${originalUrl}`
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (typeof value === 'string') headers.set(name, value)
  }
  return new Request(url, { method: request.method ?? 'GET', headers })
}

export function createExpressAICrawlerMiddleware(config: MetricPanelAICrawlConfig) {
  return (request: NodeRequestLike, response: NodeResponseLike, next?: () => void) => {
    try {
      const webRequest = createRequestFromNodeRequest(request)
      const decision = shouldTrackAICrawlerRequest(webRequest, config)
      if (decision.shouldTrack) {
        const send = () => {
          void sendAICrawlerRequest(webRequest, config, decision, {
            statusCode: normalizeStatusCode(response?.statusCode),
          })
        }
        if (typeof response?.once === 'function') response.once('finish', send)
        else send()
      }
    } catch (error) {
      reportError(config, error)
    } finally {
      if (typeof next === 'function') next()
    }
  }
}

export function createMetricPanelAICrawl(config: MetricPanelAICrawlConfig): MetricPanelAICrawl {
  const normalizedConfig = {
    ...config,
    websiteId: required(config.websiteId, 'websiteId'),
    token: required(config.token, 'token'),
  }
  if (!normalizedConfig.token.startsWith(API_TOKEN_PREFIX)) {
    throw new Error('token must be a MetricPanel API token')
  }

  const tracker: MetricPanelAICrawl = {
    shouldTrack(request) {
      return shouldTrackAICrawlerRequest(request, normalizedConfig)
    },
    async track(request, response) {
      const decision = shouldTrackAICrawlerRequest(request, normalizedConfig)
      if (!decision.shouldTrack) return skippedResult(decision)
      if (normalizedConfig.waitUntil) {
        scheduleWaitUntil(
          normalizedConfig.waitUntil,
          normalizedConfig,
          sendAICrawlerRequest(request, normalizedConfig, decision, response)
        )
        return scheduledResult(decision)
      }
      return sendAICrawlerRequest(request, normalizedConfig, decision, response)
    },
    withHandler<T extends AICrawlResponse>(handler: (request: Request) => T | Promise<T>) {
      return async (request: Request) => {
        const response = await handler(request)
        await tracker.track(request, response)
        return response
      }
    },
  }
  return tracker
}
