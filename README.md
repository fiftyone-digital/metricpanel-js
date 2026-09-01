# MetricPanel JavaScript packages

Public source and release mirror for MetricPanel's JavaScript packages.

| Package                                        | Purpose                                | Install                         |
| ---------------------------------------------- | -------------------------------------- | ------------------------------- |
| [`@metricpanel/sdk`](./packages/sdk)           | Browser and React Native analytics SDK | `npm add @metricpanel/sdk`      |
| [`@metricpanel/ai-crawl`](./packages/ai-crawl) | Server-side AI crawler analytics       | `npm add @metricpanel/ai-crawl` |

## Development model

Package source is maintained in the private MetricPanel product monorepo and synchronized here by
an automated pull request. This repository is the public review, CI, provenance, and npm release
boundary. Package directories should not be edited directly here; see [MIRRORING.md](./MIRRORING.md).

The release infrastructure in this repository is intentionally public-owned and is not overwritten
by synchronization.

## Verify

```bash
bun install --frozen-lockfile
bun run check
bun run build
bun run verify:packages
```

These checks verify the source mirror manifest, run package tests and static checks, inspect packed
tarballs, and consume them from clean Bun, Node.js ESM, Node.js CommonJS, and browser-bundle
fixtures.

## Releases

Packages version independently. Publish a GitHub release using the matching tag:

- `sdk-v1.2.3` publishes `@metricpanel/sdk@1.2.3`
- `ai-crawl-v1.2.3` publishes `@metricpanel/ai-crawl@1.2.3`

Publishing uses npm Trusted Publishing and GitHub Actions OIDC. No long-lived npm token is stored.

## License

MIT
