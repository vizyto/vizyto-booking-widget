// Assemble the Cloudflare Pages deploy directory from the vite build.
// Produces:
//   deploy/v1/widget.js   - rolling "latest v1" the embed snippets point at
//   deploy/_headers       - CORS + cache rules
//   deploy/index.html     - tiny landing at widget.vizyto.com root
// Run after `vite build` (the `build:cdn` script chains them).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

if (!existsSync('dist/widget.js')) {
  console.error('[build-deploy] dist/widget.js not found — run `vite build` first')
  process.exit(1)
}

mkdirSync('deploy/v1', { recursive: true })
copyFileSync('dist/widget.js', 'deploy/v1/widget.js')

// /v1/widget.js is a moving pointer (v1.x patches land here), so cache it only
// briefly — embedders get fixes within minutes without re-pasting the snippet.
writeFileSync(
  'deploy/_headers',
  `/v1/widget.js
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=600, stale-while-revalidate=86400
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
