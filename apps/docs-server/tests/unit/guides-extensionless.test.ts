/**
 * Pins extensionless guide URLs.
 *
 * `resolveGuidePath` must serve both URL forms: `scripts/build-search-index.ts`
 * strips `.md` when building each entry's `url` (`rel.replace(/\.md$/, '')`)
 * and the Cmd-K palette JS navigates straight to that url, while rendered
 * guide pages emit `.md`-suffixed hrefs (which must keep working) and any
 * hand-written pretty link omits the extension. The fallback lives in the
 * resolver so both forms resolve; stripping only in the generator would fix
 * the palette and break every extensionless link.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolveGuidePath } from '../../src/guides'

describe('resolveGuidePath — extensionless URLs', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'docs-guides-ext-'))
    mkdirSync(join(root, 'architecture'), { recursive: true })
    writeFileSync(join(root, 'architecture', 'services.md'), '# Services\n\nBody text.\n')
    writeFileSync(join(root, 'GLOSSARY.md'), '# Glossary\n\nTerms.\n')
    // A directory that shares a prefix with nothing, to keep cases distinct.
    mkdirSync(join(root, 'integrate'), { recursive: true })
    writeFileSync(join(root, 'integrate', 'README.md'), '# Integrate\n')
  })

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('serves the exact URL the search index emits (no .md suffix)', () => {
    const result = resolveGuidePath(root, '/guides/architecture/services')
    expect(result.status).toBe(200)
    expect(String(result.body)).toContain('Services')
  })

  it('still serves the .md form that rendered pages link to', () => {
    const result = resolveGuidePath(root, '/guides/architecture/services.md')
    expect(result.status).toBe(200)
    expect(String(result.body)).toContain('Services')
  })

  it('serves a top-level extensionless doc', () => {
    expect(resolveGuidePath(root, '/guides/GLOSSARY').status).toBe(200)
  })

  it('still 404s a genuinely missing doc rather than resolving something else', () => {
    expect(resolveGuidePath(root, '/guides/architecture/does-not-exist').status).toBe(404)
  })

  it('still 308s a real directory to its trailing-slash form', () => {
    // A directory must keep winning over any same-named `.md` fallback.
    expect(resolveGuidePath(root, '/guides/integrate').status).toBe(308)
  })

  it('does not let the .md fallback escape the docs root', () => {
    // `../../etc/passwd` must stay a 403/404 — the fallback appends `.md`,
    // it must not widen what the traversal guard already rejects.
    const result = resolveGuidePath(root, '/guides/../../../../etc/passwd')
    expect([403, 404]).toContain(result.status)
  })
})

describe('resolveGuidePath — the generated markdown reference', () => {
  // docs/README.md links `./api-reference/api-reference.md`. Inside the docs
  // site that page is the Swagger reference, so it must land on /unified-api
  // in one hop rather than via the old /api-reference redirect.
  it.each(['/guides/api-reference', '/guides/api-reference/api-reference.md'])(
    '301s %s straight to /unified-api',
    (url) => {
      const result = resolveGuidePath(tmpdir(), url)
      expect(result).toMatchObject({ status: 301, redirectTo: '/unified-api' })
    },
  )
})
