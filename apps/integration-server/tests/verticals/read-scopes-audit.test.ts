/**
 * The curated OAuth scope data must not ship strings the provider rejects.
 *
 * Fabricated scope strings make authorize fail with `invalid_scope`, so the
 * connection can never be made. The other failure mode is a read-only set
 * claimed for a provider that cannot express read-only at all.
 *
 * `scripts/read-scopes-audit.json` records how each of the 197 curated
 * read-scope entries is verified against the provider's own documentation.
 * These tests hold the line: a scope the audit records as fabricated must
 * not appear, and a provider documented as having no read-only mode must
 * not carry a READ_SCOPES entry — that entry is what makes a `read_only`
 * Connect Link claim a guarantee the platform cannot honour.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const REPO = join(__dirname, '../../../..')
const AUDIT = JSON.parse(
  readFileSync(join(REPO, 'scripts/read-scopes-audit.json'), 'utf8'),
) as {
  platforms: Record<
    string,
    { verdict: string; invalidScopes: string[]; supportsReadOnly: string }
  >
}

/** Parse one exported `Record<string, readonly string[]>` map out of a generated file. */
function parseMap(src: string, name: string): Record<string, string[]> {
  const start = src.indexOf(`export const ${name}`)
  if (start === -1) return {}
  const rest = src.slice(start)
  const end = rest.indexOf('\nexport const ', 10)
  const block = end === -1 ? rest : rest.slice(0, end)
  const out: Record<string, string[]> = {}
  for (const m of block.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\[([^\]]*)\]/gms)) {
    out[m[1]!] = [...m[2]!.matchAll(/'([^']+)'/g)].map((s) => s[1]!)
  }
  return out
}

function shipped(vertical: string): { read: Record<string, string[]>; rec: Record<string, string[]> } {
  const src = readFileSync(
    join(REPO, `apps/integration-server/src/verticals/${vertical}/platforms/read-scopes.generated.ts`),
    'utf8',
  )
  return { read: parseMap(src, 'READ_SCOPES'), rec: parseMap(src, 'RECOMMENDED_SCOPES_EXTRA') }
}

const VERTICALS = [...new Set(Object.keys(AUDIT.platforms).map((k) => k.split('/')[0]!))]
const CACHE = new Map(VERTICALS.map((v) => [v, shipped(v)]))

describe('curated scopes vs the documentation audit', () => {
  it('ships no scope string the audit found fabricated', () => {
    const offenders: string[] = []
    for (const [key, entry] of Object.entries(AUDIT.platforms)) {
      if (!entry.invalidScopes?.length) continue
      const [vertical, slug] = key.split('/') as [string, string]
      const { read, rec } = CACHE.get(vertical)!
      const bad = new Set(entry.invalidScopes)
      for (const scope of read[slug] ?? []) if (bad.has(scope)) offenders.push(`${key} READ_SCOPES:${scope}`)
      for (const scope of rec[slug] ?? []) if (bad.has(scope)) offenders.push(`${key} RECOMMENDED:${scope}`)
    }
    expect(offenders).toEqual([])
  })

  it('claims no read-only set for a provider that has none', () => {
    const offenders = Object.entries(AUDIT.platforms)
      .filter(([, e]) => e.verdict === 'no_read_only')
      .map(([key]) => key)
      .filter((key) => {
        const [vertical, slug] = key.split('/') as [string, string]
        return (CACHE.get(vertical)!.read[slug] ?? []).length > 0
      })
    expect(offenders).toEqual([])
  })

  it('makes no claim about the platforms it could not verify', () => {
    // `uncertain` means the provider publishes no reachable enumerated scope
    // list — not that our data is wrong. Such an entry must therefore carry no
    // flagged strings, so nothing downstream can use a failed fetch as grounds
    // for deleting scopes we cannot prove are fabricated.
    const claiming = Object.entries(AUDIT.platforms)
      .filter(([, e]) => e.verdict === 'uncertain')
      .filter(([, e]) => (e.invalidScopes?.length ?? 0) > 0)
      .map(([key]) => key)
    expect(claiming).toEqual([])
  })

  it('records an evidence URL for every platform it did decide', () => {
    const undecidable = Object.entries(AUDIT.platforms)
      .filter(([, e]) => e.verdict === 'invalid_scopes' || e.verdict === 'no_read_only')
      .filter(([, e]) => !(e as { evidenceUrl?: string }).evidenceUrl)
      .map(([key]) => key)
    expect(undecidable).toEqual([])
  })
})
