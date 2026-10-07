// Assemble the Cloudflare Pages deploy directory from the vite build.
// Produces rolling v1, a content-addressed build/manifest, hashed fonts and licenses.
// Run after `vite build` (the `build:cdn` script chains them).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { collectFontAssets, sha256 } from './font-assets.mjs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

if (!existsSync('dist/widget.js')) {
  console.error('[build-deploy] dist/widget.js not found — run `vite build` first')
  process.exit(1)
}

mkdirSync('deploy/v1', { recursive: true })
copyFileSync('dist/widget.js', 'deploy/v1/widget.js')

const { manifest: fonts, assets } = collectFontAssets()
const builtFonts = JSON.parse(readFileSync('dist/font-manifest.json', 'utf8'))
if (JSON.stringify(builtFonts) !== JSON.stringify(fonts)) {
  throw new Error('Font inputs changed after Vite build; rebuild before assembling deploy/')
}
for (const asset of assets) {
  const target = `deploy${asset.path}`
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, asset.bytes)
}
const widgetHash = sha256(readFileSync('dist/widget.js'))
const versionPath = `/v/${widgetHash}`
mkdirSync(`deploy${versionPath}`, { recursive: true })
copyFileSync('dist/widget.js', `deploy${versionPath}/widget.js`)
const manifest = {
  ...fonts,
  widget: { version: pkg.version, path: `${versionPath}/widget.js`, hash: widgetHash },
  capabilities: ['fontPackId', 'accent', 'accentLight', 'accentDark', 'onAccent', 'theme', 'font-off'],
}
writeFileSync(`deploy${versionPath}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')

// Rolling v1 retains its existing cache policy. SWR permits stale responses;
// max-age=600 does not guarantee client updates within ten minutes.
writeFileSync(
  'deploy/_headers',
  `/v1/widget.js
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=600, stale-while-revalidate=86400

/v/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable

/releases.json
  Cache-Control: no-store
`,
)

writeFileSync(
  'deploy/index.html',
  `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vizyto Booking Widget</title>
    <style>
      body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #0b0b0c; color: #fafafa; margin: 0; display: grid; place-items: center; min-height: 100vh; text-align: center; padding: 24px; }
      a { color: #fd9320; }
      code { background: #1f1f22; padding: 2px 6px; border-radius: 6px; font-size: 13px; }
    </style>
  </head>
  <body>
    <div>
      <h1>Vizyto Booking Widget</h1>
      <p>Plik osadzany: <code>https://widget.vizyto.com/v1/widget.js</code></p>
      <p><a href="https://vizyto.com/blog/widget-rezerwacji-na-strone-internetowa">Jak osadzić widget na swojej stronie →</a></p>
    </div>
  </body>
</html>
`,
)

console.log(`[build-deploy] deploy/ ready (v1/widget.js, v${pkg.version})`)
console.log(`[build-deploy] immutable: ${versionPath}/widget.js`)
console.log(`[build-deploy] manifest: ${versionPath}/manifest.json`)
console.log(`[build-deploy] fonts: ${assets.filter((a) => a.path.endsWith('.woff2')).length} WOFF2, 9 OFL licenses`)
