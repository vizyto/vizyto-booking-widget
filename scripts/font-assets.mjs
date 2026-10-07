// Shared by Vite and the CDN assembler. Only approved local WOFF2 files are read.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root))
const packs = JSON.parse(read('src/font-packs.json'))
export const weights = [400, 500, 600, 700] // CSS 650 matches static 700; no UI weight changes.

export function collectFontAssets() {
  const assets = []
  const fontPacks = {}
  for (const [id, family] of Object.entries(packs)) {
    const slug = family.toLowerCase().replaceAll(' ', '-')
    const base = `node_modules/@fontsource/${slug}`
    const pkg = JSON.parse(read(`${base}/package.json`))
    if (pkg.license !== 'OFL-1.1') throw new Error(`Unexpected license: ${slug}`)
    const license = read(`${base}/LICENSE`)
    const licensePath = `/fonts/${slug}/LICENSE.${sha256(license)}.txt`
    assets.push({ path: licensePath, bytes: license })
    const files = []
    for (const weight of weights) {
      const css = read(`${base}/${weight}.css`).toString()
      for (const subset of ['latin', 'latin-ext']) {
        const filename = `${slug}-${subset}-${weight}-normal.woff2`
        const face = css.split('@font-face').find((block) => block.includes(`./files/${filename}`))
        const unicodeRange = face?.match(/unicode-range:\s*([^;]+);/)?.[1]
        if (!unicodeRange) throw new Error(`Missing unicode range: ${filename}`)
        const bytes = read(`${base}/files/${filename}`)
        const hash = sha256(bytes)
        const path = `/fonts/${slug}/${hash}.woff2`
        files.push({ path, weight, style: 'normal', subset, unicodeRange, hash })
        assets.push({ path, bytes })
      }
    }
    fontPacks[id] = { family, package: `@fontsource/${slug}`, packageVersion: pkg.version,
      license: 'OFL-1.1', licensePath, weights, files }
  }
  const content = { schemaVersion: 1, fontPacks }
  return { manifest: { ...content, hash: sha256(JSON.stringify(content)) }, assets }
}
