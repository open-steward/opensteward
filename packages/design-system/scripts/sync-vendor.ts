#!/usr/bin/env tsx
/**
 * Copy vendored browser assets out of node_modules into `vendor/`, which the
 * `/design/` static mount already serves from both admin and docs-server.
 *
 * Why vendor at all: loading these from public CDNs at runtime would
 * contradict OpenSteward's core claim — self-hosted, no telemetry, nothing
 * phones home — and not merely cosmetically: Swagger UI is the whole API
 * reference and lunr is the docs search, so an air-gapped or egress-filtered
 * deployment would lose working pages, not merely an icon font. It would also
 * be a supply chain hole, since a floating tag on a public CDN serves
 * whatever it resolves to at request time.
 *
 * Why a script rather than committing the files: the versions stay pinned in
 * package.json where Dependabot can see them, and `vendor/` is gitignored, so
 * upgrading is a lockfile change rather than a binary diff.
 *
 * Runs from design-system's `build` script, so every build and every image
 * refreshes it. Add a new asset by extending ASSETS.
 */
import { mkdirSync, copyFileSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const PKG_ROOT = resolve(__dirname, '..')
const VENDOR = join(PKG_ROOT, 'vendor')

/** [source relative to node_modules, destination relative to vendor/] */
const ASSETS: Array<[string, string]> = [
  // Phosphor icon webfont. style.css references the font files by relative
  // path, so the whole set has to travel together.
  ['@phosphor-icons/web/src/regular/style.css', 'phosphor/regular/style.css'],
  ['@phosphor-icons/web/src/regular/Phosphor.woff2', 'phosphor/regular/Phosphor.woff2'],
  ['@phosphor-icons/web/src/regular/Phosphor.woff', 'phosphor/regular/Phosphor.woff'],
  ['@phosphor-icons/web/src/regular/Phosphor.ttf', 'phosphor/regular/Phosphor.ttf'],

  // Swagger UI, for the Unified API and Operator API pages in docs-server.
  ['swagger-ui-dist/swagger-ui.css', 'swagger-ui/swagger-ui.css'],
  ['swagger-ui-dist/swagger-ui-bundle.js', 'swagger-ui/swagger-ui-bundle.js'],
  ['swagger-ui-dist/swagger-ui-standalone-preset.js', 'swagger-ui/swagger-ui-standalone-preset.js'],

  // lunr, for the docs search palette.
  ['lunr/lunr.min.js', 'lunr/lunr.min.js'],

  // Mermaid, for diagrams in the guides. The UMD bundle deliberately, not the
  // ESM one: mermaid.esm.min.mjs is a 32 KB loader that pulls 206 chunks at
  // runtime, so vendoring the ESM build means shipping the whole 83 MB dist.
  // The UMD build is one self-contained 3.5 MB file that sets globalThis.mermaid.
  ['mermaid/dist/mermaid.min.js', 'mermaid/mermaid.min.js'],

  // svg-pan-zoom, for expanding those diagrams.
  ['svg-pan-zoom/dist/svg-pan-zoom.min.js', 'svg-pan-zoom/svg-pan-zoom.min.js'],
]

function resolveFrom(rel: string): string {
  // pnpm's layout means a dependency can resolve either under this package's
  // own node_modules or the workspace root. Check both rather than assuming.
  const candidates = [
    join(PKG_ROOT, 'node_modules', rel),
    join(PKG_ROOT, '..', '..', 'node_modules', rel),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error(
    `vendored asset not found: ${rel}\n` +
      `  looked in:\n${candidates.map((c) => `    ${c}`).join('\n')}\n` +
      `  run \`pnpm install\` first.`,
  )
}

/**
 * Drop the SVG entry from Phosphor's @font-face src chain.
 *
 * Phosphor.svg is 2.9 MB — nearly as large as everything else vendored here
 * combined — and the SVG font format is only reached by browsers that support
 * neither woff2, woff, nor truetype (iOS Safari 4, Android Browser 4.3). Not
 * shipping it would leave the stylesheet pointing at a 404, so remove the
 * reference rather than carrying the file.
 */
function stripSvgFontSrc(): void {
  const css = join(VENDOR, 'phosphor/regular/style.css')
  const before = readFileSync(css, 'utf8')
  const after = before.replace(/,?\s*url\("\.\/Phosphor\.svg#Phosphor"\) format\("svg"\)/, '')
  if (after === before) {
    throw new Error(
      `sync-vendor: expected an SVG src entry in ${css} and found none — ` +
        'Phosphor changed its stylesheet, so re-check this transform.',
    )
  }
  writeFileSync(css, after)
}

function main(): void {
  // Rebuild from scratch so a removed entry does not linger in an image.
  rmSync(VENDOR, { recursive: true, force: true })

  for (const [from, to] of ASSETS) {
    const src = resolveFrom(from)
    const dest = join(VENDOR, to)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  stripSvgFontSrc()

  console.log(`[sync-vendor] copied ${ASSETS.length} asset(s) → packages/design-system/vendor/`)
}

main()
