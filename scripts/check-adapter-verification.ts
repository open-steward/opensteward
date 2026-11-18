/**
 * CI guard + coverage report for per-adapter verification tiers
 * (`verification` in each vertical's `platforms/metadata.ts`, with provenance
 * in `scripts/adapter-verification-audit.json`).
 *
 * The catalog advertises ~1,545 adapters. Most were scaffolded and have never
 * been run against a real API. The `verification` field is what makes that
 * difference visible in the admin picker, `docs/platforms/platforms.md` and
 * the README — which means a badge that is wrong, or that outlived the code it
 * described, is worse than no badge at all. This guard exists to stop that.
 *
 * Hard failures (exit 1 unless `--soft`):
 *   - A platform declares `verification` with no entry in the audit ledger.
 *     An unevidenced badge is exactly the claim we cannot let ship.
 *   - A ledger entry names a `vertical/slug` that does not exist, or one whose
 *     platform carries no `verification` field. Both mean the two files have
 *     drifted and one of them is lying.
 *   - A ledger `tier` that disagrees with the metadata tier.
 *   - An unknown tier, or a missing/blank `verifiedAt`, `verifiedBy` or
 *     `evidence`.
 *   - A `verifiedAt` that is not ISO `YYYY-MM-DD`, or is in the future.
 *   - The README's verification tally not matching the real counts. The README
 *     is hand-written, so without this it silently rots.
 *
 * Warnings (never fail the build):
 *   - STALENESS: the adapter directory has commits newer than `verifiedAt`.
 *     This is the whole reason the ledger stores a date — code moves on and a
 *     verification badge quietly stops being true. A warning rather than an
 *     error because a README typo fix inside the adapter directory should not
 *     break the build; the fix is to re-verify and bump the date.
 *
 *     `verifiedAt` is THE DATE THE EVIDENCE WAS PRODUCED — when the sync job
 *     ran, not when somebody typed the entry up. The distinction is the whole
 *     check: recording a run a day or two after doing it used to push the date
 *     past an intervening commit and silence the warning, which is exactly the
 *     drift this exists to catch. If the two dates differ, the run's date is
 *     the one that goes here; say when it was written up in `evidence` if it
 *     matters.
 *   - An entry whose listed `suites` are not on disk, at any tier — a promoted
 *     adapter keeps its suite list, and those paths must stay honest too.
 *   - A platform marked `unsupported` that also claims verification.
 *
 * Coverage (informational): how many adapters sit on each rung, per vertical
 * and overall. Low coverage is the honest current state, not a failure.
 *
 * Run: `pnpm check:adapter-verification` (add `--soft` to report only).
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  VERIFICATION_TIERS,
  VERIFICATION_LABELS,
  isVerificationTier,
  verificationReadmeSentence,
  type VerificationTier,
} from '../packages/shared/src/reference/platform-verification'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const INTEGRATION_ROOT = join(REPO_ROOT, 'apps/integration-server')
const VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

interface AuditEntry {
  tier: string
  /** ISO date the evidence was produced — when the run happened, NOT when the
   *  entry was written up. Staleness compares this against the adapter's last
   *  commit, so a write-up date would let an intervening commit slip past. */
  verifiedAt: string
  verifiedBy: string
  evidence: string
  suites?: string[]
}

const AUDIT: Record<string, AuditEntry> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'scripts/adapter-verification-audit.json'), 'utf8'),
).adapters

interface PlatformLike {
  slug: string
  verification?: unknown
  unsupported?: unknown
}

async function loadPlatforms(vertical: string): Promise<PlatformLike[]> {
  const metaFile = join(VERTICALS_DIR, vertical, 'platforms/metadata.ts')
  const meta = (await import(pathToFileURL(metaFile).href)) as { PLATFORMS?: PlatformLike[] }
  return meta.PLATFORMS ?? []
}

/**
 * ISO date of the adapter directory's last commit, or null when the adapter
 * has no directory (metadata-only platform) or no commits yet. Uses git rather
 * than mtime because a fresh clone rewrites every mtime to checkout time,
 * which would make staleness depend on when you cloned.
 */
function lastCommitFor(vertical: string, slug: string): string | null {
  const rel = `apps/integration-server/src/verticals/${vertical}/adapters/${slug}`
  if (!existsSync(join(REPO_ROOT, rel))) return null
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim()
    return out ? out.slice(0, 10) : null
  } catch {
    // No git, shallow clone with no history for this path, or a detached
    // worktree — staleness is unknowable, which is not an error.
    return null
  }
}

/** A zero count for every tier, built from the tier list so it cannot drift. */
function zeroCounts(): Record<VerificationTier, number> {
  return Object.fromEntries(VERIFICATION_TIERS.map((t) => [t, 0])) as Record<
    VerificationTier,
    number
  >
}

async function main() {
  const soft = process.argv.includes('--soft')
  const errors: string[] = []
  const warnings: string[] = []
  const seenKeys = new Set<string>()
  const totals = zeroCounts()
  let grandTotal = 0

  for (const vertical of VERTICALS) {
    const platforms = await loadPlatforms(vertical)
    const perVertical = zeroCounts()
    grandTotal += platforms.length

    for (const p of platforms) {
      const where = `${vertical}/${p.slug}`
      const raw = p.verification
      if (raw === undefined) continue

      if (!isVerificationTier(raw)) {
        errors.push(
          `${where}: unknown verification tier ${JSON.stringify(raw)} (expected one of ${VERIFICATION_TIERS.join(', ')})`,
        )
        continue
      }

      perVertical[raw]++
      totals[raw]++
      seenKeys.add(where)

      const audit = AUDIT[where]
      if (!audit) {
        errors.push(
          `${where}: declares verification '${raw}' but has no entry in scripts/adapter-verification-audit.json — a badge with no evidence behind it`,
        )
        continue
      }

      if (audit.tier !== raw) {
        errors.push(
          `${where}: metadata says '${raw}' but the audit ledger says '${audit.tier}' — the two have drifted`,
        )
      }
      for (const field of ['verifiedAt', 'verifiedBy', 'evidence'] as const) {
        const v = audit[field]
        if (typeof v !== 'string' || v.trim() === '') {
          errors.push(`${where}: audit entry is missing a non-empty '${field}'`)
        }
      }

      if (typeof audit.verifiedAt === 'string' && audit.verifiedAt.trim() !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(audit.verifiedAt)) {
          errors.push(`${where}: verifiedAt '${audit.verifiedAt}' is not ISO YYYY-MM-DD`)
        } else {
          const today = new Date().toISOString().slice(0, 10)
          if (audit.verifiedAt > today) {
            errors.push(`${where}: verifiedAt '${audit.verifiedAt}' is in the future`)
          }
          const lastCommit = lastCommitFor(vertical, p.slug)
          if (lastCommit && lastCommit > audit.verifiedAt) {
            warnings.push(
              `${where}: adapter last changed ${lastCommit}, verified ${audit.verifiedAt} — re-verify and bump verifiedAt, or the badge is stale`,
            )
          }
        }
      }

      // Checked at every tier, not just `unit-tested`. An adapter promoted to
      // `verified` keeps its suite list when the suites still exist and still
      // pass, and those paths must stay honest too — gating this on the tier
      // meant a promoted entry's suites silently stopped being validated.
      if (audit.suites) {
        const missing = audit.suites.filter((s) => !existsSync(join(INTEGRATION_ROOT, s)))
        if (missing.length > 0) {
          warnings.push(`${where}: audit lists suite(s) not on disk: ${missing.join(', ')}`)
        }
      }

      if (p.unsupported) {
        warnings.push(
          `${where}: marked unsupported but also claims verification '${raw}' — an adapter nobody can connect should not advertise a tier`,
        )
      }
    }

    const verified = VERIFICATION_TIERS.reduce((n, t) => n + perVertical[t], 0)
    const pct = platforms.length > 0 ? ((verified / platforms.length) * 100).toFixed(1) : '0.0'
    console.log(
      `${vertical.padEnd(18)} ${String(verified).padStart(4)}/${String(platforms.length).padStart(4)} verified (${pct.padStart(5)}%)` +
        (verified > 0
          ? `  [${VERIFICATION_TIERS.filter((t) => perVertical[t] > 0)
              .map((t) => `${t}: ${perVertical[t]}`)
              .join(', ')}]`
          : ''),
    )
  }

  // Ledger entries with no matching platform. Caught after the sweep so we
  // know every key the metadata actually produced.
  for (const key of Object.keys(AUDIT)) {
    if (!seenKeys.has(key)) {
      errors.push(
        `audit ledger has an entry for '${key}' but that platform does not exist or carries no verification field`,
      )
    }
  }

  const verifiedAll = VERIFICATION_TIERS.reduce((n, t) => n + totals[t], 0)
  const pctAll = grandTotal > 0 ? ((verifiedAll / grandTotal) * 100).toFixed(1) : '0.0'
  console.log(`\nTOTAL: ${verifiedAll}/${grandTotal} adapters verified (${pctAll}%)`)
  for (const t of VERIFICATION_TIERS) {
    console.log(`  ${VERIFICATION_LABELS[t].padEnd(20)} ${totals[t]}`)
  }

  // The platforms-doc generator writes this sentence into README.md, and
  // check:docs fails on a stale copy. Checked here too, so this guard alone
  // still catches a README that was hand-edited or not regenerated.
  const expected = verificationReadmeSentence({ ...totals, total: grandTotal })
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')
  if (verifiedAll > 0 && !readme.includes(expected)) {
    errors.push(
      `README.md is missing the current verification tally. Run \`pnpm --filter integration-server run generate:platforms-doc\`. Expected to find:\n      ${expected}`,
    )
  }

  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} warning(s):`)
    for (const w of warnings) console.log(`  - ${w}`)
  }

  if (errors.length > 0) {
    console.error(`\n✖ ${errors.length} error(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    if (!soft) {
      process.exitCode = 1
      return
    }
  } else {
    console.log('\n✓ No adapter-verification integrity errors.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
