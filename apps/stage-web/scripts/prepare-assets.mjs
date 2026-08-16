import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const repoRoot = resolve(appRoot, '..', '..')
const publicDir = resolve(appRoot, 'public')
const primary = resolve(repoRoot, 'NIVA.vrm')

if (!existsSync(primary)) {
  throw new Error(`NIVA.vrm not found at ${primary}`)
}

mkdirSync(publicDir, { recursive: true })
const models = readdirSync(repoRoot)
  .filter((name) => /^NIVA.*\.vrm$/i.test(name))
  .sort((a, b) => a === 'NIVA.vrm' ? -1 : b === 'NIVA.vrm' ? 1 : a.localeCompare(b))

for (const name of models) {
  const source = resolve(repoRoot, name)
  const target = resolve(publicDir, name)
  copyFileSync(source, target)
  console.log(`Prepared ${name} -> ${target}`)
}

writeFileSync(
  resolve(publicDir, 'models.json'),
  JSON.stringify(models.map((file, index) => ({
    id: file,
    name: index === 0 ? 'NIVA · 备用模型' : file.replace(/\.vrm$/i, ''),
  })), null, 2),
)
