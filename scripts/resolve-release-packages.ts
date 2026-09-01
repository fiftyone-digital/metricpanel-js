import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

type MirrorManifest = {
  packages: Array<{
    name: string
    path: string
  }>
}

type PackageJson = {
  version?: string
}

type ReleasePackage = {
  key: string
  name: string
  path: string
  version: string
  tag: string
  publish: boolean
}

async function resourceExists(url: string, headers?: HeadersInit): Promise<boolean> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers,
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return true
}

const repositoryRoot = join(import.meta.dir, '..')
const manifest = JSON.parse(
  await readFile(join(repositoryRoot, '.mirror-manifest.json'), 'utf8')
) as MirrorManifest
const repository = process.env.GITHUB_REPOSITORY ?? 'fiftyone-digital/metricpanel-js'
const githubHeaders: HeadersInit = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
if (process.env.GITHUB_TOKEN) {
  githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
}

const packages: ReleasePackage[] = []

for (const mirroredPackage of manifest.packages) {
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, mirroredPackage.path, 'package.json'), 'utf8')
  ) as PackageJson
  if (!packageJson.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
    throw new Error(`${mirroredPackage.name} has an invalid release version`)
  }

  const key = mirroredPackage.name.split('/').at(-1)
  if (!key) throw new Error(`${mirroredPackage.name} cannot be mapped to a release tag`)

  const tag = `${key}-v${packageJson.version}`
  const npmPublished = await resourceExists(
    `https://registry.npmjs.org/${encodeURIComponent(mirroredPackage.name)}/${packageJson.version}`
  )
  const releaseExists = await resourceExists(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    githubHeaders
  )

  if (!npmPublished || !releaseExists) {
    packages.push({
      key,
      name: mirroredPackage.name,
      path: mirroredPackage.path,
      version: packageJson.version,
      tag,
      publish: !npmPublished,
    })
  }
}

const matrix = JSON.stringify({ include: packages })
const githubOutput = process.env.GITHUB_OUTPUT
if (githubOutput) {
  await appendFile(githubOutput, `packages=${matrix}\ncount=${packages.length}\n`)
} else {
  console.log(matrix)
}
