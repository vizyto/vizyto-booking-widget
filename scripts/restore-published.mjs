// Keep every immutable /v/<hash>/ release reachable across deploys. Cloudflare
// static assets replace the whole directory, so before each deploy this restores
// the releases listed in the live /releases.json (widget, manifest and the fonts it
// references), verifies their hashes and writes the merged list back.
// Fails closed: any error other than "no list published yet" aborts the deploy.
// Run after `node scripts/build-deploy.mjs`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { sha256 } from './font-assets.mjs'

const origin = process.env.WIDGET_ORIGIN ?? 'https://widget.vizyto.com'
const HASH = /^[0-9a-f]{64}$/

async function get(path) {
  const res = await fetch(`${origin}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function write(path, bytes) {
  const target = `deploy${path}`
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
}

// Every asset a manifest points at: the widget plus each font file and license.
function referencedPaths(manifest) {
  const paths = [manifest.widget.path]
  for (const pack of Object.values(manifest.fontPacks ?? {})) {
    paths.push(pack.licensePath, ...pack.files.map((file) => file.path))
  }
  return paths
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const current = { hash: sha256(readFileSync('dist/widget.js')), version: pkg.version }
if (!existsSync(`deploy/v/${current.hash}/manifest.json`)) {
  throw new Error('deploy/ is not assembled; run build:cdn first')
}

let published = []
const res = await fetch(`${origin}/releases.json`, { cache: 'no-store' })
if (res.ok) {
  published = (await res.json()).releases
  if (!Array.isArray(published)) throw new Error('releases.json has no releases array')
} else if (res.status !== 404) {
  throw new Error(`/releases.json: HTTP ${res.status}`)
} else {
  console.log('[restore-published] no releases.json yet: first immutable release')
}

for (const release of published) {
  if (!HASH.test(release.hash)) throw new Error(`Invalid release hash: ${release.hash}`)
  if (existsSync(`deploy/v/${release.hash}/manifest.json`)) continue
  const manifestBytes = await get(`/v/${release.hash}/manifest.json`)
  const manifest = JSON.parse(manifestBytes.toString())
  if (manifest.widget?.hash !== release.hash) throw new Error(`Manifest mismatch for ${release.hash}`)
  for (const path of referencedPaths(manifest)) {
    if (existsSync(`deploy${path}`)) continue
    const bytes = await get(path)
    const expected = path.match(/([0-9a-f]{64})(?:\/widget\.js|\.woff2|\.txt)$/)?.[1]
    if (!expected || sha256(bytes) !== expected) throw new Error(`Hash mismatch for ${path}`)
    write(path, bytes)
  }
  write(`/v/${release.hash}/manifest.json`, manifestBytes)
  console.log(`[restore-published] restored /v/${release.hash}/ (v${release.version})`)
}

const known = new Set(published.map((release) => release.hash))
const releases = known.has(current.hash) ? published : [...published, current]
writeFileSync('deploy/releases.json', JSON.stringify({ releases }, null, 2) + '\n')
console.log(`[restore-published] releases.json: ${releases.length} immutable release(s)`)
