import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const auditDirectory = await mkdtemp(join(tmpdir(), 'metricpanel-ai-crawl-audit-'))

try {
  execFileSync('bun', ['pm', 'pack', '--destination', auditDirectory], {
    cwd: packageDirectory,
    stdio: 'inherit',
  })
  const tarball = (await readdir(auditDirectory)).find((file) => file.endsWith('.tgz'))
  if (!tarball) throw new Error('bun pm pack did not create an npm tarball')

  execFileSync('attw', ['--pack', join(auditDirectory, tarball)], {
    cwd: packageDirectory,
    stdio: 'inherit',
  })
} finally {
  await rm(auditDirectory, { recursive: true, force: true })
}
