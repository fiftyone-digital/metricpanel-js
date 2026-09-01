# @metricpanel/sdk

Official TypeScript/JavaScript SDK for MetricPanel Analytics.

## Features

- TypeScript support
- Lightweight browser bundle
- Privacy controls for Do Not Track, cookieless mode, and consent gating
- Browser support for React, Vue, Svelte, vanilla JS, and modern bundlers
- React Native/native JavaScript entrypoint without DOM globals
- Pageviews, screen views, events, revenue, and goals
- Session-scoped last-touch campaign attribution across internal navigation
- Hostname and query capture plus first-external-referrer persistence for acquisition reports
- Stripe metadata helpers for revenue attribution

## Installation

```bash
npm add @metricpanel/sdk
```

Other supported package managers:

```bash
bun add @metricpanel/sdk
npm install @metricpanel/sdk
pnpm add @metricpanel/sdk
yarn add @metricpanel/sdk
```

## Quick Start

```typescript
import { createMetricPanel } from '@metricpanel/sdk'

const metricpanel = createMetricPanel({
  websiteId: 'your-website-id',
  apiUrl: 'https://api.metricpanel.io/api',
})

// Track pageview
await metricpanel.pageview()

// Track custom event
await metricpanel.event('button_click', { button: 'cta' })

// Track revenue
await metricpanel.revenue({ amount: 2999 })

// Track goal
await metricpanel.goal({ name: 'signup', value: 2500, properties: { plan: 'pro' } })
```

The browser SDK defaults to `https://api.metricpanel.io/api` and sends events to
`https://api.metricpanel.io/api/events`. The explicit value above makes the hosted destination
obvious in copied configuration. To use a first-party proxy, override `apiUrl` with the base path
that forwards the `/events` route to MetricPanel:

```typescript
const metricpanel = createMetricPanel({
  websiteId: 'your-website-id',
  apiUrl: '/analytics/api',
})
```

Trailing slashes are normalized. An empty `apiUrl` is rejected instead of falling back silently.
Revenue amounts must be positive integers in the smallest currency unit, and currency values use
three-letter ISO codes. For USD, `2999` means `$29.99`. Goal values must be non-negative integers
in the smallest currency unit. Custom event and goal properties are limited to 10 fields; keep them
flat and do not send email addresses, names, credentials, or other sensitive personal data.

## React Native

Use the separate native entrypoint so React Native apps do not load browser-only code:

```typescript
import { createMetricPanelNative } from '@metricpanel/sdk/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const metricpanel = createMetricPanelNative({
  websiteId: 'your-website-id',
  apiUrl: 'https://api.metricpanel.io/api',
  storage: AsyncStorage,
  platform: 'ios',
  os: 'iOS',
})

await metricpanel.screen('Home')
await metricpanel.event('signup_tapped', { placement: 'hero' })
await metricpanel.revenue({ amount: 2999, currency: 'usd' })
```

The native entrypoint sends events to `POST /api/events` with the same website ID,
visitor ID, session ID, event, goal, and revenue fields used by the browser SDK.
It does not include automatic navigation instrumentation, native device plugins, push
campaign attribution, or an iOS/Android platform package.

## Pageview strategy

Choose one pageview strategy per page:

- Use the hosted tracking script if you want automatic initial-load and SPA navigation pageviews.
- Use the SDK if you want to trigger pageviews manually with `metricpanel.pageview()`.

Do not load the hosted script and also call SDK pageviews for the same page lifecycle unless you intentionally want both events.

For a client-side router, keep one SDK instance and call `pageview()` after each completed route
change. Set `trackHashRoutes: true` only for routers whose route state lives in the URL hash.

## Browser and Next.js lifecycle

Importing the package is safe in Node and during Next.js server rendering, but browser tracking must
be initialized in client-side code because it reads `window`, `document`, cookies, and browser
storage.

```tsx
'use client'

import { useEffect } from 'react'
import { createMetricPanel } from '@metricpanel/sdk'

export function Analytics() {
  useEffect(() => {
    const metricpanel = createMetricPanel({
      websiteId: 'your-website-id',
      apiUrl: 'https://api.metricpanel.io/api',
    })

    void metricpanel.pageview()
    return () => metricpanel.destroy()
  }, [])

  return null
}
```

Localhost and loopback traffic is ignored by default. Set `allowLocalhost: true` while deliberately
testing a local application. `destroy()` releases an instance without removing persisted identity;
`revokeConsent()` stops tracking and removes the website-scoped consent, attribution, and cookie
identity state.

Browser persistence uses MetricPanel-owned names: `metricpanel_visitor` and
`metricpanel_session` for cookies, `metricpanel_attribution:<websiteId>` and
`metricpanel_referrer:<websiteId>` for session storage, and
`metricpanel_consent:<websiteId>` for consent storage. Version 1.1.2 automatically migrates the
legacy `mtrk_*` browser keys on first initialization, preserving existing visitor and session IDs,
campaign attribution, referrer, and granted consent while removing the legacy entries.

Network failures never break the host application. Provide `onError` if the application needs
diagnostic visibility:

```typescript
const metricpanel = createMetricPanel({
  websiteId: 'your-website-id',
  onError: (error) => reportAnalyticsDiagnostic(error),
})
```

## Documentation

See the [MetricPanel SDK guide](https://metricpanel.io/docs/sdk) for complete documentation
including:

- Installation methods
- API reference
- Framework examples (React, Vue, Svelte, Next.js)
- Stripe integration
- Best practices
- Troubleshooting

## Building

```bash
bun install
bun run build
```

Output:

- `dist/index.cjs` / `dist/index.mjs` - Browser SDK
- `dist/react-native.cjs` / `dist/react-native.mjs` - React Native/native SDK entrypoint
- `dist/*.d.ts` - TypeScript definitions and declaration maps
- `dist/*.map` - JavaScript source maps

## License

MIT
