# Contributing

Thanks for helping improve MetricPanel's public JavaScript packages.

## Development

Use Bun for local development:

```bash
bun install
bun run check
bun run build
bun run verify:packages
```

Tests use browser mocks or in-memory state only and do not require a MetricPanel account or any
hosted database.

## Pull requests

- Package source under `packages/` is maintained in the private product monorepo and arrives through
  generated synchronization pull requests. Report desired package changes through an issue or a
  focused proposal; maintainers apply them to the canonical source first.
- Public release infrastructure, repository policy, and documentation can be changed directly here.
- Run `bun run check`, `bun run build`, and `bun run verify:packages` before opening a pull request.
- Use Conventional Commit messages.
- Do not include credentials, real website IDs, or customer analytics data.

By contributing, you agree that your contribution is licensed under the MIT License.
