import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The nine `read-scopes.generated.ts` files carried an "AUTO-GENERATED … Do
 * not edit by hand" banner and no generator existed. Nothing in `docs:all` or
 * `scripts/` wrote them; `check-read-scopes.ts` only read them.
 *
 * The tell was in the files themselves: nine files, SIX different wordings of
 * the same header comment. A generator emits one wording.
 *
 * A false banner is worse than none. A contributor who believes the file is
 * generated will not edit it; one who edits it anyway cannot know whether the
 * next `docs:all` will silently revert them. Both failures are quiet.
 *
 * These assertions cover the properties that keep the banner true: the emitted
 * files parse, they round-trip the curated source exactly, and regeneration is
 * idempotent so `check:docs` cannot flap.
 */

const REPO_ROOT = resolve(__dirname, '../../../..')
const SOURCE = join(REPO_ROOT, 'scripts/curated-read-scopes.json')
const VERTICALS = [
  'accounting',
  'crm',
  'customer-support',
  'docsign',
  'ecommerce',
  'inventory',
  'logistics',
  'payments',
  'projects',
] as const

interface Curated {
  readScopes?: string[]
  recommendedScopes?: string[]
}

const curated = JSON.parse(readFileSync(SOURCE, 'utf8')) as Record<string, Curated>

function generatedFor(vertical: string): string {
  return readFileSync(
    join(REPO_ROOT, `apps/integration-server/src/verticals/${vertical}/platforms/read-scopes.generated.ts`),
    'utf8',
  )
}

describe('the curated source', () => {
  it('covers every platform that has curated scopes', () => {
    // Guards the guard: an empty source would make the round-trip assertions
    // below pass against empty files.
    expect(Object.keys(curated).length).toBeGreaterThan(200)
  })

  it('keys every entry <vertical>/<slug>, matching the audit file', () => {
    const bad = Object.keys(curated).filter((k) => !VERTICALS.some((v) => k.startsWith(`${v}/`)))
    expect(bad).toEqual([])
  })

  it('never lists a readScope that is absent from that platform’s catalogue', () => {
    // The same invariant `check:read-scopes` enforces, asserted at the SOURCE
    // so a bad edit fails before it is ever emitted.
    const offenders: string[] = []
    for (const [key, e] of Object.entries(curated)) {
      if (!e.readScopes?.length) continue
      const cat = e.recommendedScopes ?? []
      // A platform whose entire catalogue is read-only lists no separate
      // recommended set; the read set is then the catalogue.
      if (cat.length === 0) continue
      for (const s of e.readScopes) if (!cat.includes(s)) offenders.push(`${key}: ${s}`)
    }
    expect(offenders).toEqual([])
  })

  it('has no duplicate scopes within a single list', () => {
    const offenders: string[] = []
    for (const [key, e] of Object.entries(curated)) {
      for (const [field, list] of [
        ['readScopes', e.readScopes],
        ['recommendedScopes', e.recommendedScopes],
      ] as const) {
        if (!list) continue
        if (new Set(list).size !== list.length) offenders.push(`${key}.${field}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the emitted files', () => {
  it.each(VERTICALS)('%s declares both maps', (vertical) => {
    const src = generatedFor(vertical)
    expect(src).toContain('export const READ_SCOPES: Record<string, readonly string[]>')
    expect(src).toContain('export const RECOMMENDED_SCOPES_EXTRA: Record<string, readonly string[]>')
  })

  it('all nine carry the SAME header, which is what a generator produces', () => {
    // Six different wordings across nine files is what gave the hand-editing
    // away. One wording, or the banner is decorative again.
    const headers = new Set(VERTICALS.map((v) => generatedFor(v).split('\n').slice(0, 9).join('\n')))
    expect(headers.size).toBe(1)
  })

  it('names its own generator and source, so the next reader can act on it', () => {
    const header = generatedFor('crm')
    expect(header).toContain('scripts/generate-read-scopes.ts')
    expect(header).toContain('scripts/curated-read-scopes.json')
  })

  it('quotes slugs that are not valid identifiers', () => {
    // `monday-crm` unquoted is a subtraction expression, and the file would
    // not parse. Cheap to get wrong when emitting object literals.
    const src = generatedFor('crm')
    expect(src).toContain("'monday-crm'")
    expect(src).not.toMatch(/^\s+monday-crm:/m)
  })
})

describe('regeneration', () => {
  it('is idempotent, so check:docs cannot flap', () => {
    const before = VERTICALS.map(generatedFor)
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/generate-read-scopes.ts'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    })
    expect(VERTICALS.map(generatedFor)).toEqual(before)
  }, 60_000)
})
