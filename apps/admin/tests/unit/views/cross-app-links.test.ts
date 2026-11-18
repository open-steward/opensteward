/**
 * Links to docs-server carry docs-server's origin.
 *
 * The admin and the docs portal are separate services on separate ports. A
 * root-relative `href="/unified-api"` resolves against the admin, which does
 * not serve docs pages — so every docs link must carry `docsServerUrl`, and
 * the failure is invisible to inspection because the href looks perfectly
 * ordinary.
 *
 * `docsServerUrl` is injected into every render by a hook in core/server.ts and
 * always has a value (it defaults to http://localhost:3003, trailing slash
 * stripped at config load), so prefixing is always safe.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ADMIN = join(__dirname, '../../..')
const VIEWS = join(ADMIN, 'views')

function ejsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) ejsFiles(full, acc)
    else if (entry.endsWith('.ejs')) acc.push(full)
  }
  return acc
}

/**
 * Path prefixes docs-server owns and the admin does not serve. Adding one here
 * is how a new docs section gets the same protection.
 */
// `api-reference` is the Unified API's old path (it 301s to /unified-api) —
// kept so a stale link pointed at the admin still fails here.
const DOCS_ONLY = ['unified-api', 'operator-api', 'api-reference', 'guides', 'postman', 'integrate']

describe('cross-app documentation links', () => {
  const views = ejsFiles(VIEWS)

  it('is looking at the views it thinks it is', () => {
    expect(views.length).toBeGreaterThan(20)
  })

  it('never points a docs path at the admin origin', () => {
    // Root-relative: resolves against whatever host is serving the page, which
    // for these paths is the wrong one.
    const pattern = new RegExp(String.raw`href="/(${DOCS_ONLY.join('|')})(/|"|#|\?)`)
    const offenders = views
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ADMIN, f))
    expect(offenders).toEqual([])
  })

  it('routes every docs link through docsServerUrl', () => {
    // Catches the other half: an absolute link to a hardcoded host would work
    // on one deployment and break on every other.
    const offenders: string[] = []
    for (const file of views) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/href="([^"]*(?:unified-api|operator-api|api-reference|\/guides\/)[^"]*)"/g)) {
        const href = m[1]
        if (href.includes('docsServerUrl')) continue
        offenders.push(`${relative(ADMIN, file)}: ${href}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
