import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { collectFontAssets } from './scripts/font-assets.mjs'

const { manifest } = collectFontAssets()

// Single-file IIFE bundle: dist/widget.js. Embed with one <script> tag.
export default defineConfig({
  plugins: [preact(), {
    name: 'widget-font-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'font-manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' })
    },
  }],
  server: { port: 4500 },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VIZYTO_FONT_MANIFEST__: JSON.stringify(manifest),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'VizytoBooking',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    cssCodeSplit: false,
    minify: 'esbuild',
    target: 'es2019',
    emptyOutDir: true,
  },
})
