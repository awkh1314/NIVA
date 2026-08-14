import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const source = resolve(appRoot, '..', '..', 'NIVA.vrm')
const publicDir = resolve(appRoot, 'public')
const target = resolve(publicDir, 'NIVA.vrm')

if (!existsSync(source)) {
  throw new Error(`NIVA.vrm not found at ${source}`)
}

mkdirSync(publicDir, { recursive: true })
copyFileSync(source, target)
console.log(`Prepared NIVA.vrm -> ${target}`)
