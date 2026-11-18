import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * OpenSteward claims to be self-hosted with nothing phoning home — the
 * regulated and air-gapped deployments in docs/business-cases/ depend on it.
 * All browser assets (Phosphor, Swagger UI, lunr, Mermaid, svg-pan-zoom)
 * are vendored into packages/design-system/vendor and served from
 * /design/vendor/ — a CDN reference would falsify the self-hosted claim and
 * break air-gapped deployments (an API reference without Swagger UI does not
 * render).
 *
 * This test fails if a CDN reference is introduced — a one-line regression
 * that is otherwise invisible until someone deploys without egress.
 *
 * See THIRD-PARTY-NOTICES.md.
 */

const SRC_ROOTS = [
  resolve(__dirname, '../../src'),
  resolve(__dirname, '../../../admin/views'),
  resolve(__dirname, '../../../admin/src'),
  resolve(__dirname, '../../../../packages/platforms-ui/src'),
]

// Hosts that serve executable code or styling to the browser. Deliberately not
// a general URL ban: adapter fixtures and schema examples are full of
// https://cdn.example.com/... placeholders, and docs legitimately link out.
const ASSET_CDN = /(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|ajax\.googleapis\.com)/

function walk(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'vendor') continue
      out = out.concat(walk(p))
    } else if (/\.(ts|tsx|ejs|css|html)$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

describe('browser assets are self-hosted', () => {
  it('no source file references a third-party asset CDN', () => {
    const offenders: string[] = []
    for (const root of SRC_ROOTS) {
      for (const file of walk(root)) {
        const text = readFileSync(file, 'utf8')
        text.split('\n').forEach((line, i) => {
          if (ASSET_CDN.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`)
        })
      }
    }
    expect(
      offenders,
      `Browser assets must be vendored into packages/design-system/vendor and served from ` +
        `/design/vendor/, not fetched from a CDN — a self-hosted deployment must make no ` +
        `third-party request. Add the asset to packages/design-system/scripts/sync-vendor.ts ` +
        `and reference /design/vendor/... instead.\n\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
