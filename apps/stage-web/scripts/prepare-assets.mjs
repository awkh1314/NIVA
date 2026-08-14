import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const repoRoot = resolve(appRoot, '..', '..')
const publicDir = resolve(appRoot, 'public')
const fallback = resolve(repoRoot, 'NIVA.vrm')
const preferredName = 'AvatarSample_A.vrm'

if (!existsSync(fallback)) {
  throw new Error(`NIVA.vrm not found at ${fallback}`)
}

mkdirSync(publicDir, { recursive: true })
const models = readdirSync(repoRoot)
  .filter((name) => /\.vrm$/i.test(name))
  .sort((a, b) => {
    if (a === preferredName) return -1
    if (b === preferredName) return 1
    if (a === 'NIVA.vrm') return -1
    if (b === 'NIVA.vrm') return 1
    return a.localeCompare(b)
  })

for (const name of models) {
  const source = resolve(repoRoot, name)
  const target = resolve(publicDir, name)
  copyFileSync(source, target)
  console.log(`Prepared ${name} -> ${target}`)
}

writeFileSync(
  resolve(publicDir, 'models.json'),
  JSON.stringify(models.map((file) => ({
    id: file,
    name: file === preferredName
      ? 'AvatarSample_A · 默认模型'
      : file === 'NIVA.vrm'
        ? 'NIVA · 备用模型'
        : file.replace(/\.vrm$/i, ''),
  })), null, 2),
)
