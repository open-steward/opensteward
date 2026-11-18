/**
 * Adapter verification tier.
 *
 * Breadth is not depth. Every platform in the catalog has an adapter, but
 * they have not all been exercised to the same degree: a few are driven
 * against a real API, most were produced by `pnpm scaffold:adapter` and have
 * never had a single live call made through them. A catalog that presents
 * all of them identically over-claims.
 *
 * Every vertical's `platforms/metadata.ts` entry may carry an optional
 * `verification?: VerificationTier` recording how far its adapter has
 * actually been taken. The tiers are ordered — each subsuming the one below
 * — and the *absence* of the field is itself the bottom rung:
 *
 *   (absent)             scaffolded; generated, never exercised
 *   'unit-tested'        transform + factory tests present and passing
 *   'verified'           real calls through our adapter against the
 *                        platform's API: its sandbox or test mode, or a
 *                        live tenant
 *
 * Sandbox and live-tenant runs are one rung on purpose. A platform's sandbox
 * serves the same API as its production, so the split said more about which
 * account we had than about our adapter. Until 2026-11 they were two tiers,
 * `sandbox-verified` and `production-verified`; both now read as unknown. The
 * ledger's `evidence` still says which environment each run used.
 *
 * Absence rather than an explicit `'scaffolded'` is deliberate: the vast
 * majority of platforms sit on the bottom rung, and writing that out on
 * every one would be a large diff carrying no information. It also keeps
 * `platforms.json` byte-identical for every platform nobody has verified —
 * the same discipline `unsupported` follows next door.
 *
 * This field records only WHICH rung. The provenance — who verified it,
 * when, and against what — lives in `scripts/adapter-verification-audit.json`
 * and is policed by `pnpm check:adapter-verification`, exactly as
 * `readScopes` pairs with `scripts/read-scopes-audit.json`. Keeping the prose
 * out of the metadata is what stops 1,545-entry catalog files turning into
 * an audit log.
 *
 * That ledger's `verifiedAt` is the date the evidence was produced — when the
 * run happened, not when it was written up. The guard compares it against the
 * adapter's last commit, so a write-up date would let a commit made in between
 * slip past unnoticed.
 */

export type VerificationTier = 'unit-tested' | 'verified'

/** Every tier, weakest first. Iteration order is the ladder order. */
export const VERIFICATION_TIERS: ReadonlyArray<VerificationTier> = ['unit-tested', 'verified']

/** Human labels for UI chips, docs tables and CLI output. */
export const VERIFICATION_LABELS: Record<VerificationTier, string> = {
  'unit-tested': 'Unit tested',
  verified: 'Verified',
}

/**
 * Rung height, 1-based. `0` means unverified (no field), so a plain numeric
 * compare answers "is this at least unit-tested?" without special-casing
 * the absent value.
 */
export const VERIFICATION_RANK: Record<VerificationTier, number> = {
  'unit-tested': 1,
  verified: 2,
}

/**
 * Narrow an unknown (a hand-edited metadata entry, a parsed JSON ledger) to a
 * real tier. Everything else — a typo, a stale tier name, a non-string — is
 * rejected, so a malformed entry reads as unverified rather than crashing a
 * generator or rendering a bogus badge.
 */
export function isVerificationTier(value: unknown): value is VerificationTier {
  // Membership test against the tier list, NOT `value in VERIFICATION_RANK` —
  // `in` walks the prototype chain, so that spelling accepts 'toString',
  // 'constructor' and '__proto__' as valid tiers and would happily render a
  // badge for one.
  return typeof value === 'string' && (VERIFICATION_TIERS as ReadonlyArray<string>).includes(value)
}

/** `true` when `tier` is at least `floor`. Absent/malformed is below everything. */
export function meetsVerification(tier: unknown, floor: VerificationTier): boolean {
  return isVerificationTier(tier) && VERIFICATION_RANK[tier] >= VERIFICATION_RANK[floor]
}

/**
 * Build a `${vertical}:${slug}` → tier index from a flat platform list — the
 * same shape `server.ts` merges from every vertical's `PLATFORMS` array.
 * Platforms with no (or a malformed) `verification` field are omitted, so
 * `.get()` returning `undefined` is the whole "nobody has verified this" check.
 */
export function verificationIndex(
  platforms: ReadonlyArray<{
    vertical?: string
    slug: string
    verification?: unknown
  }>,
): Map<string, VerificationTier> {
  const out = new Map<string, VerificationTier>()
  for (const p of platforms) {
    if (isVerificationTier(p.verification)) out.set(`${p.vertical}:${p.slug}`, p.verification)
  }
  return out
}

/**
 * Tally a platform list into a count per tier plus the unverified remainder.
 * Drives the README summary line, the `platforms.md` header and the coverage
 * report in `check:adapter-verification`, so all three agree by construction
 * rather than by three separate hand-maintained counts.
 */
export function verificationTally(
  platforms: ReadonlyArray<{ verification?: unknown }>,
): Record<VerificationTier, number> & { unverified: number; total: number } {
  const out = {
    'unit-tested': 0,
    verified: 0,
    unverified: 0,
    total: platforms.length,
  }
  for (const p of platforms) {
    if (isVerificationTier(p.verification)) out[p.verification]++
    else out.unverified++
  }
  return out
}

/**
 * The README's one-sentence verification count, for example
 * `**8 of 1,548** adapters have been exercised beyond scaffolding (1 unit tested, 7 verified).`
 *
 * The platforms-doc generator writes it into README.md (and `check:docs` then
 * fails on a stale copy), and `check:adapter-verification` looks for it, so the
 * two agree by construction. Thousands separators match how the README writes
 * platform counts everywhere else ("1,548 platforms").
 */
export function verificationReadmeSentence(
  tally: Record<VerificationTier, number> & { total: number },
): string {
  const verified = VERIFICATION_TIERS.reduce((n, t) => n + tally[t], 0)
  const breakdown =
    VERIFICATION_TIERS.filter((t) => tally[t] > 0)
      .map((t) => `${tally[t].toLocaleString('en-US')} ${VERIFICATION_LABELS[t].toLowerCase()}`)
      .join(', ') || 'none yet'
  return (
    `**${verified.toLocaleString('en-US')} of ${tally.total.toLocaleString('en-US')}** ` +
    `adapters have been exercised beyond scaffolding (${breakdown}).`
  )
}

/**
 * Matches that sentence whatever its numbers, so the generator can find and
 * replace it. No `g` flag: a shared global regex carries `lastIndex` between
 * callers; build a global copy where one is needed.
 */
export const VERIFICATION_README_SENTENCE =
  /\*\*[\d,]+ of [\d,]+\*\* adapters have been exercised beyond scaffolding \([^)]*\)\./
