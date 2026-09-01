# @metricpanel/ai-crawl

Server-side AI and search crawler tracking for MetricPanel. It runs where crawlers fetch documents,
so it does not depend on client-side JavaScript and never sends ordinary visitor traffic.

- [Setup guide](https://docs.metricpanel.io/ai-crawlers)
- [Crawler directory](https://metricpanel.io/crawlers)

## Install

```bash
bun add @metricpanel/ai-crawl
```

Create an ingest-scoped API token in MetricPanel. Keep it server-only; valid tokens start with
`mp_live_`. The tracker uses `https://api.metricpanel.io` by default.

## Next.js 16+ / Vercel

```ts
// proxy.ts
import { trackAICrawlerRequest } from '@metricpanel/ai-crawl'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const config = {
  websiteId: process.env.METRICPANEL_WEBSITE_ID!,
  token: process.env.METRICPANEL_INGEST_TOKEN!,
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  trackAICrawlerRequest(request, event, config)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
}
```

Do not await the context overload. It schedules the network request with `event.waitUntil` and
returns immediately. Keep crawler-facing files such as `robots.txt`, `llms.txt`, `llms-full.txt`,
and sitemap XML inside the matcher.

Next.js Proxy runs before the matched route, so it cannot see the final response status. These
events are recorded with an unknown status instead of an assumed `200`. To capture exact `404` and
`5xx` statuses on Vercel, send production Log Drain events to
`https://api.metricpanel.io/ai-crawls/vercel` with the custom header
`Authorization: Bearer mp_live_...`. Choose JSON or NDJSON without compression and include static,
edge, and function logs. Use either the Log Drain or middleware collection for one deployment, not
both, so the same request is not counted twice. Other runtimes should use a response-aware
integration below.

## Cloudflare Pages

```ts
import { trackAICrawlerRequest } from '@metricpanel/ai-crawl'

export function onRequest(context) {
  trackAICrawlerRequest(context.request, context, {
    websiteId: context.env.METRICPANEL_WEBSITE_ID,
    token: context.env.METRICPANEL_INGEST_TOKEN,
  })
  return context.next()
}
```

## Cloudflare Workers

```ts
import { trackAICrawlerResponse } from '@metricpanel/ai-crawl'

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext) {
    const response = await env.ASSETS.fetch(request)
    trackAICrawlerResponse(request, response, context, {
      websiteId: env.METRICPANEL_WEBSITE_ID,
      token: env.METRICPANEL_INGEST_TOKEN,
    })
    return response
  },
}
```

The wrapper sees the final response and records its status when the runtime exposes a `waitUntil`
context.

## Express

```ts
import express from 'express'
import { createExpressAICrawlerMiddleware } from '@metricpanel/ai-crawl'

const app = express()
app.use(
  createExpressAICrawlerMiddleware({
    websiteId: process.env.METRICPANEL_WEBSITE_ID!,
    token: process.env.METRICPANEL_INGEST_TOKEN!,
  })
)
```

Express continues immediately. Tracking starts after the response finishes so MetricPanel can also
capture its status code.

## Hono and generic Request/Response handlers

```ts
import { trackAICrawlerResponse } from '@metricpanel/ai-crawl'

app.use('*', async (context, next) => {
  await next()
  trackAICrawlerResponse(context.req.raw, context.res, context.executionCtx, {
    websiteId: context.env.METRICPANEL_WEBSITE_ID,
    token: context.env.METRICPANEL_INGEST_TOKEN,
  })
})
```

Use `trackAICrawlerRequest(request, config)` when you want the awaited result, or
`trackAICrawlerRequest(request, context, config)` for non-blocking platform scheduling.

## Result contract

`shouldTrackAICrawlerRequest` returns an eligibility decision with an explicit `shouldTrack`
discriminant. Tracking helpers return a result with one of four stable states:

- `skipped`: the request did not pass the local crawler, method, category, or path filters.
- `scheduled`: delivery was handed to a background lifecycle hook or started as best-effort work.
- `tracked`: the MetricPanel ingestion endpoint accepted the awaited request.
- `failed`: an awaited request failed at the network or API boundary.

`tracked` is only `true` for the `tracked` state. `scheduled` is only `true` for the `scheduled`
state, so background scheduling is never reported as confirmed delivery.

## Filtering and configuration

All crawler categories are enabled by default. Opt out without changing middleware placement:

```ts
trackAICrawlerRequest(request, event, {
  websiteId: process.env.METRICPANEL_WEBSITE_ID!,
  token: process.env.METRICPANEL_INGEST_TOKEN!,
  disableAnswerFetch: true,
  disableSearchCrawlers: true,
  disableTrainingCrawlers: true,
  disableOtherCrawlers: true,
})
```

Available configuration:

- `enabled`: disable tracking without removing middleware.
- `apiUrl`: route ingestion through a configured first-party proxy.
- `publicOrigin`: replace an internal container or proxy origin while retaining path and query.
- `source`: identify the integration that generated the event.
- `methods`: HTTP methods to track; defaults to `GET` and `HEAD`.
- `getIp`: extract the client IP for a custom runtime.
- `fetch`: supply a runtime-specific or test fetch implementation.
- `waitUntil`: provide a platform background-task hook once at tracker creation.
- `timeoutMs`: outbound timeout; defaults to 1,500 ms.
- `maxUrlLength`: maximum event URL length; defaults to 8,192 characters.
- `ignoredPathPrefixes` and `ignoredExtensions`: replace the built-in safety filters.
- `additionalIgnoredPathPrefixes` and `additionalIgnoredExtensions`: extend the defaults.
- `shouldTrackPath`: apply a final application-specific path predicate.
- `onError` and `debug`: observe best-effort tracking failures without breaking the host app.

## What gets tracked

The package classifies known answer engines, AI/search indexing agents, training crawlers, and other
AI-related bots. It filters normal browsers, API and admin routes, framework internals, static
assets, media, fonts, maps, and archives before any network call. Known crawler requests to
`robots.txt`, `llms.txt`, `llms-full.txt`, Markdown documents, and sitemap XML remain trackable.

Local user-agent matching is a fast prefilter. MetricPanel's ingestion API classifies the request
again and verifies its IP against provider-published ranges when available, so the server remains
the source of truth as the catalog evolves.

The event payload contains the website ID, full requested URL including its query string, HTTP
method, crawler user agent, available client IP, response status and content type, integration
source, and timestamp. The ingest token is sent only in the authorization header. MetricPanel uses
raw IPs only for provider-range verification and stores the resulting hash, not the raw address.

Crawler IDs and the four category values are stable across 1.x. New crawler definitions and new
provider documentation or range sources may be added without a major release; existing IDs are not
renamed or reused within 1.x.

## Convenience tracker

`createMetricPanelAICrawl` provides a small instance API for integrations that prefer it:

```ts
const crawls = createMetricPanelAICrawl({ websiteId, token, waitUntil })
const result = await crawls.track(request, response)
const wrapped = crawls.withHandler(handler)
```

Tracking errors are best-effort and never change the response returned to a crawler.

## License

MIT
