import { readFile } from 'node:fs/promises'
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

const baseSha = Bun.argv[2]
if (!baseSha || !/^[0-9a-f]{40}$/.test(baseSha)) {
  throw new Error('Pass the pull request base commit SHA')
}

const repositoryRoot = join(import.meta.dir, '..')
const manifest = JSON.parse(
  await readFile(join(repositoryRoot, '.mirror-manifest.json'), 'utf8')
) as MirrorManifest

const diff = Bun.spawnSync(['git', 'diff', '--name-only', `${baseSha}...HEAD`], {
  cwd: repositoryRoot,
  stdout: 'pipe',
  stderr: 'pipe',
})
if (diff.exitCode !== 0) {
  throw new Error(`Unable to inspect package changes\n${diff.stderr.toString()}`)
}

const changedFiles = diff.stdout.toString().trim().split('\n').filter(Boolean)
let changedPackages = 0

for (const mirroredPackage of manifest.packages) {
  const packagePrefix = `${mirroredPackage.path}/`
  if (!changedFiles.some((file) => file.startsWith(packagePrefix))) continue

  changedPackages += 1
  const currentPackage = JSON.parse(
    await readFile(join(repositoryRoot, mirroredPackage.path, 'package.json'), 'utf8')
  ) as PackageJson
  if (!currentPackage.version) {
    throw new Error(`${mirroredPackage.name} does not declare a version`)
  }

  const previousPackage = Bun.spawnSync(
    ['git', 'show', `${baseSha}:${mirroredPackage.path}/package.json`],
    { cwd: repositoryRoot, stdout: 'pipe', stderr: 'pipe' }
  )

  if (previousPackage.exitCode !== 0) {
    console.log(`${mirroredPackage.name}@${currentPackage.version} is a new public package`)
    continue
  }

  const previousVersion = (JSON.parse(previousPackage.stdout.toString()) as PackageJson).version
  if (previousVersion === currentPackage.version) {
    throw new Error(
      `${mirroredPackage.name} changed without a version bump (${currentPackage.version})`
    )
  }

  console.log(
    `Verified ${mirroredPackage.name} version bump: ${previousVersion} -> ${currentPackage.version}`
  )
}

if (changedPackages === 0) {
  console.log('No mirrored package files changed')
}
