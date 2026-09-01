import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const declarationFiles = (await readdir(distDirectory)).filter((file) => file.endsWith('.d.ts'))

function withRuntimeExtension(contents: string, extension: 'mjs' | 'cjs') {
  return contents.replace(/(['"])(\.{1,2}\/[^'"]+)\1/g, (match, quote, specifier: string) => {
    const currentExtension = extname(specifier)
    if (currentExtension && currentExtension !== '.js') return match

    const baseSpecifier = currentExtension === '.js' ? specifier.slice(0, -3) : specifier
    return `${quote}${baseSpecifier}.${extension}${quote}`
  })
}

for (const declarationFile of declarationFiles) {
  const baseName = declarationFile.slice(0, -'.d.ts'.length)
  const declarationPath = join(distDirectory, declarationFile)
  const declaration = await readFile(declarationPath, 'utf8')
  const sourceMapPath = `${declarationPath}.map`
  const sourceMap = JSON.parse(await readFile(sourceMapPath, 'utf8')) as Record<string, unknown>

  for (const target of [
    { declarationExtension: 'd.mts', runtimeExtension: 'mjs' },
    { declarationExtension: 'd.cts', runtimeExtension: 'cjs' },
  ] as const) {
    const targetFile = `${baseName}.${target.declarationExtension}`
    const targetMapFile = `${targetFile}.map`
    const targetDeclaration = withRuntimeExtension(
      declaration.replace(`${declarationFile}.map`, targetMapFile),
      target.runtimeExtension
    )

    await writeFile(join(distDirectory, targetFile), targetDeclaration)
    await writeFile(
      join(distDirectory, targetMapFile),
      `${JSON.stringify({ ...sourceMap, file: targetFile })}\n`
    )
  }
}
