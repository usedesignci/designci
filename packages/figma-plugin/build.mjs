/**
 * Bundles the plugin. Figma loads exactly two artifacts — one main-thread
 * script and one UI html — so everything is bundled in: core into main.js,
 * Preact and the app into an inline script in ui.html. There is no module
 * system and no network inside the plugin sandbox.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

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

const ui = await build({
  entryPoints: ['src/ui/index.tsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  logLevel: 'info',
})

const [template, css] = await Promise.all([
  readFile('src/ui/template.html', 'utf8'),
  readFile('src/ui/ui.css', 'utf8'),
])

const js = ui.outputFiles[0].text
// `</script>` inside the bundle would end the inline tag early.
const inlineSafe = js.replaceAll('</script>', '<\\/script>')

const html = template.replace('/*STYLE*/', () => css).replace('/*SCRIPT*/', () => inlineSafe)
await writeFile('dist/ui.html', html)
console.log(`dist/ui.html  ${(html.length / 1024).toFixed(1)}kb`)
