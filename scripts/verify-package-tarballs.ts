import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type PackageDefinition = {
  key: 'sdk' | 'ai-crawl'
  name: string
  directory: string
  requiredTarEntries: string[]
}

const repositoryRoot = join(import.meta.dir, '..')
const packages: PackageDefinition[] = [
  {
    key: 'sdk',
    name: '@metricpanel/sdk',
    directory: 'packages/sdk',
    requiredTarEntries: [
      'package/dist/index.cjs',
      'package/dist/index.cjs.map',
      'package/dist/index.d.ts',
      'package/dist/index.d.ts.map',
      'package/dist/index.mjs',
      'package/dist/index.mjs.map',
      'package/dist/react-native.cjs',
      'package/dist/react-native.d.ts',
      'package/dist/react-native.mjs',
      'package/LICENSE',
      'package/README.md',
      'package/package.json',
    ],
  },
  {
    key: 'ai-crawl',
    name: '@metricpanel/ai-crawl',
    directory: 'packages/ai-crawl',
    requiredTarEntries: [
      'package/dist/index.cjs',
      'package/dist/index.cjs.map',
      'package/dist/index.d.ts',
      'package/dist/index.d.ts.map',
      'package/dist/index.mjs',
      'package/dist/index.mjs.map',
      'package/LICENSE',
      'package/README.md',
      'package/package.json',
    ],
  },
]

function run(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed\n${stdout}\n${stderr}`)
  }
  return stdout
}

async function verifyConsumer(definition: PackageDefinition, spec: string): Promise<void> {
  const fixture = await mkdtemp(join(tmpdir(), `metricpanel-${definition.key}-consumer-`))
  try {
    await writeFile(
      join(fixture, 'package.json'),
      JSON.stringify({ name: `verify-${definition.key}`, private: true, type: 'module' }, null, 2)
    )
    run(['bun', 'add', '--exact', spec], fixture)

    if (definition.key === 'sdk') {
      run(
        [
          'bun',
          '-e',
          "import('@metricpanel/sdk').then((m) => { if (m.METRICPANEL_API_URL !== 'https://api.metricpanel.io/api') process.exit(1) })",
        ],
        fixture
      )
      run(
        [
          'node',
          '-e',
          "import('@metricpanel/sdk').then((m) => { if (typeof m.createMetricPanel !== 'function') process.exit(1) })",
        ],
        fixture
      )
      run(
        [
          'node',
          '-e',
          "const m = require('@metricpanel/sdk'); if (typeof m.createMetricPanel !== 'function') process.exit(1)",
        ],
        fixture
      )
      run(
        [
          'node',
          '-e',
          "import('@metricpanel/sdk/react-native').then((m) => { if (typeof m.createMetricPanelNative !== 'function') process.exit(1) })",
        ],
        fixture
      )
      await writeFile(
        join(fixture, 'browser.ts'),
        "import { createMetricPanel } from '@metricpanel/sdk'; export { createMetricPanel }\n"
      )
      run(['bun', 'build', 'browser.ts', '--target=browser', '--outdir=browser-dist'], fixture)
    } else {
      run(
        [
          'bun',
          '-e',
          "import('@metricpanel/ai-crawl').then((m) => { if (typeof m.trackAICrawlerRequest !== 'function') process.exit(1) })",
        ],
        fixture
      )
      run(
        [
          'node',
          '-e',
          "import('@metricpanel/ai-crawl').then((m) => { if (typeof m.createMetricPanelAICrawl !== 'function') process.exit(1) })",
        ],
        fixture
      )
      run(
        [
          'node',
          '-e',
          "const m = require('@metricpanel/ai-crawl'); if (typeof m.trackAICrawlerResponse !== 'function') process.exit(1)",
        ],
        fixture
      )
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

const artifactDirectory = await mkdtemp(join(tmpdir(), 'metricpanel-package-artifacts-'))
try {
  for (const definition of packages) {
    const packageDirectory = join(repositoryRoot, definition.directory)
    const packageJson = JSON.parse(
      await readFile(join(packageDirectory, 'package.json'), 'utf8')
    ) as {
      version: string
    }
    const tarballName = `${definition.name.slice(1).replace('/', '-')}-${packageJson.version}.tgz`
    const tarballPath = join(artifactDirectory, tarballName)

    run(['bun', 'pm', 'pack', '--destination', artifactDirectory], packageDirectory)
    const entries = run(['tar', '-tzf', tarballPath], repositoryRoot).trim().split('\n')
    for (const requiredEntry of definition.requiredTarEntries) {
      if (!entries.includes(requiredEntry)) {
        throw new Error(`${tarballName} is missing ${requiredEntry}`)
      }
    }
    if (entries.some((entry) => entry.includes('node_modules/') || entry.includes('.env'))) {
      throw new Error(`${tarballName} contains a forbidden file`)
    }

    await verifyConsumer(definition, tarballPath)
    console.log(`Verified ${definition.name}@${packageJson.version} tarball and clean consumers`)
  }
} finally {
  await rm(artifactDirectory, { recursive: true, force: true })
}
