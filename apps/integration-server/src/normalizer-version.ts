import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Identifies the normalizer that produced a cached record.
 *
 * Records are cached in NORMALIZED form. A deploy that changes a transform
 * therefore leaves every existing row in the old shape, with nothing to
 * invalidate it: a contact kept `billingAddress: {}` and an invoice kept a
 * fabricated `T00:00:00.000Z` for hours after both were fixed, while the live
 * path returned the corrected shapes for the same records. Two shapes for one
 * entity, and no TTL to age either of them out.
 *
 * Three ways to solve that, and this is the third:
 *
 *   - Flush on deploy — manual, forgettable, and a thundering herd against
 *     every upstream platform when it is not forgotten.
 *   - Store raw payloads and normalize on read — would defeat
 *     `strip-raw-payload`, which exists to keep IBANs, bank account and
 *     routing numbers out of this store. Not available to us.
 *   - Stamp rows with the identity of the code that wrote them. No deploy
 *     step, correct on rollback, and scoped: only the platforms whose
 *     normalizer actually changed are invalidated.
 *
 * The identity is a hash of the compiled normalizer surface for that
 * (vertical, platform):
 *
 *   - the platform's own `transform/` output and adapter entry point
 *   - `adapters/shared/transform`, because fixes land there too — `toUtcDate`
 *     and `toCalendarDate` both did
 *   - the vertical's `schema/`, since the canonical shape is half the contract
 *
 * Hashing the BUILT files rather than a hand-maintained constant is the point:
 * a version someone has to remember to bump is the same failure mode as
 * flushing on deploy, one step further from the deploy that needs it.
 *
 * Computed lazily and memoized per (vertical, platform) — a process only pays
 * for the platforms it actually serves, and only once each.
 */

/** Files whose content defines a normalized record's shape. */
const SUBTREES = ['transform']
const ENTRY_FILES = ['index.js', 'index.ts']

export interface NormalizerVersionOptions {
  /** Root containing `<vertical>/adapters/...` and `<vertical>/schema/`. */
  verticalsDir: string
  /** Used when the surface cannot be read — see `fallback` below. */
  fallback?: string
  onError?: (vertical: string, platform: string, err: unknown) => void
}

/** Returns whether it actually hashed anything, so callers can tell an empty
 *  tree from a hashed one — see the `hashed` count below. */
function hashFile(hash: ReturnType<typeof createHash>, path: string): boolean {
  // Read FIRST: updating the hash with the path and then throwing would leave
  // a digest that looks like real content for a tree that does not exist.
  const body = readFileSync(path)
  hash.update(path.slice(path.lastIndexOf('/verticals/')))
  hash.update(body)
  return true
}

function hashTree(hash: ReturnType<typeof createHash>, dir: string): number {
  let entries: string[]
  try {
    entries = readdirSync(dir).sort()
  } catch {
    return 0
  }
  let hashed = 0
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) hashed += hashTree(hash, full)
    // `.d.ts`/`.map` carry no behaviour and would churn the hash for nothing.
    else if (/\.(ts|js)$/.test(name) && !/\.d\.ts$/.test(name)) {
      try {
        hashed += hashFile(hash, full) ? 1 : 0
      } catch {
        /* raced with a rebuild; other files still define the version */
      }
    }
  }
  return hashed
}

export function createNormalizerVersion(
  opts: NormalizerVersionOptions,
): (vertical: string, platform: string) => string {
  const cache = new Map<string, string>()
  // A deploy identifier is the right fallback: it is wrong in the safe
  // direction (invalidates more than needed) rather than serving a record from
  // a build we could not identify.
  const fallback = opts.fallback ?? process.env['GIT_SHA'] ?? 'unknown'

  return (vertical: string, platform: string): string => {
    const key = `${vertical}:${platform}`
    const memo = cache.get(key)
    if (memo !== undefined) return memo

    let version: string
    try {
      const hash = createHash('sha256')
      const adapterDir = join(opts.verticalsDir, vertical, 'adapters', platform)
      let hashed = 0
      for (const sub of SUBTREES) hashed += hashTree(hash, join(adapterDir, sub))
      for (const entry of ENTRY_FILES) {
        try {
          hashed += hashFile(hash, join(adapterDir, entry)) ? 1 : 0
        } catch {
          /* one of the two extensions exists, not both */
        }
      }
      hashed += hashTree(hash, join(opts.verticalsDir, vertical, 'adapters', 'shared'))
      hashed += hashTree(hash, join(opts.verticalsDir, vertical, 'schema'))
      // Hashing NOTHING yields a perfectly good-looking digest, and every
      // unreadable platform would share it — letting one platform's rows
      // answer for another's. Only a tree we actually read defines a version.
      version = hashed > 0 ? hash.digest('hex').slice(0, 16) : fallback
    } catch (err) {
      opts.onError?.(vertical, platform, err)
      version = fallback
    }

    cache.set(key, version)
    return version
  }
}
