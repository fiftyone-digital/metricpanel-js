# MetricPanel JavaScript packages

Official JavaScript packages for MetricPanel.

| Package                                        | Purpose                                | Install                         |
| ---------------------------------------------- | -------------------------------------- | ------------------------------- |
| [`@metricpanel/sdk`](./packages/sdk)           | Browser and React Native analytics SDK | `npm add @metricpanel/sdk`      |
| [`@metricpanel/ai-crawl`](./packages/ai-crawl) | Server-side AI crawler analytics       | `npm add @metricpanel/ai-crawl` |

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

## License

MIT
