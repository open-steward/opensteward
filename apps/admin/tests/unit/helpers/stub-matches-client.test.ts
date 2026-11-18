/**
 * The stub's guesses must still match the real client.
 *
 * `adminApiStub` picks a default from the method's name: `list*` gives an array,
 * `get*` gives null, `has*` gives a boolean. That is a guess about the return
 * *shape*, and for six methods the name lies — `getVerticals` returns an array,
 * and five paginated reads return a `{ data, meta }` envelope rather than a
 * list. Those have explicit entries in NAMED_DEFAULTS.
 *
 * Guessing wrong is worse than not guessing. A caller destructuring
 * `{ data, meta }` out of `[]` gets two undefineds and fails somewhere else
 * entirely — a 500 anchored to an EJS line, or, in the wizard's progress
 * preHandler, a swallowed TypeError and a nav rail that silently stops
 * rendering. Both are the exact failure class the stub exists to remove.
 *
 * So this reads the real client's declared return types and fails if any
 * name-based guess disagrees with one. A seventh mismatch cannot arrive quietly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NAMED_DEFAULTS } from '../../helpers/admin-api-stub'

const CLIENT = join(__dirname, '../../../src/core/proxy/admin-api-client.ts')
const SRC = readFileSync(CLIENT, 'utf8')

interface Method {
  name: string
  returns: string
}

/**
 * Every `async name(...): Promise<T>` on the client, with T as written.
 *
 * The pattern is deliberately `[^)]*` (plain, no alternation) — an earlier
 * version used `(?:[^)]*|\n[^)]*)*?`, which reads as broader but is the
 * textbook catastrophic-backtracking shape: a bare negated class already
 * matches `\n`, so `\n[^)]*` was always a strict SUBSET of what `[^)]*`
 * alone matches, and repeating that redundant alternation under an outer
 * `*?` gives exponentially many ways to partition the same span. Any `)`
 * inside a multi-line signature's own text — a callback param `cb: () =>
 * void`, a parenthesised type, or just prose in a comment — forced the
 * engine through all of them before concluding failure at that position.
 * `testTimeout: 30_000` (`vitest.config.ts`) cannot interrupt this: it is a
 * SYNCHRONOUS loop that never yields to the event loop for the timer to
 * fire, so it doesn't fail fast — it burns the whole CI runner's wall-clock
 * budget and surfaces as "job exceeded the maximum execution time", reading
 * as infra flake rather than a bug. Measured growth on the pathological
 * input: 4× per +2 characters of unmatched span.
 *
 * This simpler form can't do anything cleverer than the old one about an
 * embedded `)` — `[^)]` still can't match a literal `)` by construction, so
 * a method with one is silently ABSENT from the returned list rather than
 * hanging the process. That is a strict improvement (a quiet gap in test
 * coverage instead of a dead CI job), and the vacuity test below
 * (`is missing only the one method…`) turns the gap itself into something
 * that fails loudly if a SECOND method ever falls into it.
 */
function declaredMethods(): Method[] {
  const re = /^ {2}async (\w+)\([^)]*\)\s*:\s*Promise<([^\n]+?)>\s*\{/gm
  const out: Method[] = []
  for (const m of SRC.matchAll(re)) {
    out.push({ name: m[1], returns: m[2].split(/\s+/).join(' ') })
  }
  return out
}

const isArray = (t: string) => t.endsWith('[]') || t.startsWith('Array<')

describe('the stub agrees with the client it stands in for', () => {
  const methods = declaredMethods()

  it('can read the client at all', () => {
    // If the regex stops matching — a formatting change, a move to arrow
    // properties — every assertion below would pass vacuously.
    expect(methods.length).toBeGreaterThan(80)
    expect(methods.map((m) => m.name)).toContain('listConnectionsPaged')
  })

  // `getLoginOptions()`'s PARENS are empty (`()`) — it is not the
  // embedded-`)` hazard `declaredMethods()`'s doc comment describes. It is
  // missed for a different, narrower reason: its return type,
  // `Promise<{ providers: …; localLoginEnabled: … }>`, itself spans three
  // lines, and `declaredMethods()`'s capture group for the return type —
  // `Promise<([^\n]+?)>` — explicitly excludes newlines (`[^\n]`), so it
  // cannot match across them. A method shaped either way — a `)` inside its
  // parameter list, OR a multi-line return type — is silently absent from
  // `methods` rather than counted, which makes every OTHER assertion in
  // this file pass vacuously for it (nothing here notices a name that was
  // never collected in the first place). Pinning the exact, current miss by
  // name is what turns a FUTURE one — of either shape — into a red test
  // instead of a second quiet hole; verified this is the only one today by
  // diffing against every `async name(` in the file.
  it('is missing only the one method whose multi-line return type the regex cannot see past', () => {
    const declaredNames = new Set(methods.map((m) => m.name))
    const allAsyncNames = [...SRC.matchAll(/^ {2}async (\w+)\(/gm)].map((m) => m[1])
    const missing = allAsyncNames.filter((n) => !declaredNames.has(n))
    expect(missing).toEqual(['getLoginOptions'])
  })

  it('has an explicit default for every method whose name lies about its shape', () => {
    const mismatched = methods
      .filter((m) => {
        if (/^list[A-Z]/.test(m.name)) return !isArray(m.returns)
        if (/^get[A-Z]/.test(m.name)) return isArray(m.returns)
        if (/^has[A-Z]/.test(m.name)) return m.returns !== 'boolean'
        return false
      })
      .map((m) => m.name)
      .filter((name) => !(name in NAMED_DEFAULTS))

    // A new client method whose shape contradicts its prefix lands here. Add it
    // to NAMED_DEFAULTS with the shape its callers destructure, rather than
    // letting the prefix rule hand back something plausible and wrong.
    expect(mismatched).toEqual([])
  })

  it('does not carry named defaults for methods that no longer exist', () => {
    // A named default outliving its method is dead weight that reads as
    // deliberate. `hasUsers` and `listTenants` are shape-correct but
    // value-corrected, so they are checked for existence, not classification.
    const names = new Set(methods.map((m) => m.name))
    const orphans = Object.keys(NAMED_DEFAULTS).filter((n) => !names.has(n))
    expect(orphans).toEqual([])
  })

  it('answers the paginated reads with an envelope, not a list', () => {
    // The concrete failure: `const { data, meta } = await listAudit(...)`
    // against `[]` yields undefined for both, and the page 500s on `meta.total`.
    for (const name of [
      'listConnectionsPaged',
      'listEndUsersPaged',
      'listSyncJobsPaged',
      'listWebhookDeliveriesPaged',
      'listAudit',
    ]) {
      const value = NAMED_DEFAULTS[name]() as { data: unknown[]; meta: { total: number } }
      expect(Array.isArray(value.data)).toBe(true)
      expect(typeof value.meta.total).toBe('number')
    }
  })

  it('answers getVerticals with a list', () => {
    // `verticals.some(...)` against null throws after orEmpty has already been
    // passed, so the wizard preHandler swallows it and the rail disappears.
    expect(Array.isArray(NAMED_DEFAULTS.getVerticals())).toBe(true)
  })
})
