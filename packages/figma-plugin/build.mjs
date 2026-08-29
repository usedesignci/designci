/**
 * Bundles the plugin. Figma loads exactly two artifacts — one main-thread
 * script and one UI html — so core is bundled in rather than resolved at
 * runtime; there is no module system inside the plugin sandbox.
 */
import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('dist', { recursive: true })

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  logLevel: 'info',
})

await copyFile('src/ui.html', 'dist/ui.html')
