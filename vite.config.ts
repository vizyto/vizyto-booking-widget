import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// Single-file IIFE bundle: dist/widget.js. Embed with one <script> tag.
export default defineConfig({
  plugins: [preact()],
  server: { port: 4500 },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
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
