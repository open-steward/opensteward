/**
 * CI guard + coverage report for per-platform read-only OAuth scopes
 * (`readScopes` in each vertical's `platforms/metadata.ts`).
 *
 * `readScopes` drives the read-only-by-default Connect Link policy: at
 * OAuth-start a link with `scope_policy = 'read_only'` requests exactly these
 * scopes (falling back to the platform default when a platform has none).
 *
 * Hard failures (exit 1 unless `--soft`):
 *   - A scope string the documentation audit found does not exist. The
 *     subset-of-catalog check below cannot see these: an invented scope
 *     present in BOTH maps validates against itself and only fails at the
 *     provider — every connection attempt returns `invalid_scope` (e.g. a
 *     fabricated `invoice.read` for Fortnox). `read-scopes-audit.json` records what was
 *     checked against which provider doc — see its header.
 *   - A `readScopes` entry on a platform the audit found has no read-only
 *     mode at all. Requesting a "read-only" set there grants writes.
 *   - A `readScopes` entry containing a scope NOT in that platform's
 *     `recommendedScopes` catalog. This is the safety net against typos and —
 *     critically — a write scope leaking into a "read-only" set. (Only enforced
 *     when the platform declares `recommendedScopes`; without a catalog there's
 *     nothing to validate against, reported as a warning.)
 *   - A non-OAuth adapter (`auth_type` not oauth2/oauth2_cc) declaring
 *     `readScopes` (scopes are meaningless there).
 *   - An empty `readScopes: []` (omit the field instead — empty means
 *     "fall back to platform default", which absence already expresses).
 *
 * Coverage (informational, never fails): how many OAuth adapters have
 * `readScopes` vs not. Full coverage is aspirational — many platforms have no
 * read-only scopes at all, so omission is legitimate.
 *
 * Run: `pnpm tsx scripts/check-read-scopes.ts` (add `--soft` to report only).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
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

const OAUTH_AUTH_TYPES = new Set(['oauth2', 'oauth2_cc'])

interface AuditEntry {
  verdict: 'ok' | 'invalid_scopes' | 'no_read_only' | 'uncertain'
  invalidScopes: string[]
  evidenceUrl: string
}

/** Provenance from the documentation audit. Keyed `vertical/slug`. */
const AUDIT: Record<string, AuditEntry> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'scripts/read-scopes-audit.json'), 'utf8'),
).platforms

interface PlatformLike {
  slug: string
  auth_type?: string
  recommendedScopes?: readonly string[]
  readScopes?: readonly string[]
}

interface Counters {
  oauthTotal: number
  withRead: number
}

async function loadPlatforms(vertical: string): Promise<PlatformLike[]> {
  const metaFile = join(VERTICALS_DIR, vertical, 'platforms/metadata.ts')
  const meta = (await import(pathToFileURL(metaFile).href)) as { PLATFORMS?: PlatformLike[] }
  const genFile = join(VERTICALS_DIR, vertical, 'platforms/read-scopes.generated.ts')
  const gen = (await import(pathToFileURL(genFile).href)) as {
    READ_SCOPES?: Record<string, readonly string[]>
    RECOMMENDED_SCOPES_EXTRA?: Record<string, readonly string[]>
  }
  const read = gen.READ_SCOPES ?? {}
  const recExtra = gen.RECOMMENDED_SCOPES_EXTRA ?? {}
  // Mirror server.ts: the curated read/catalog scopes live in the generated
  // map and override the (usually absent) inline metadata values.
  return (meta.PLATFORMS ?? []).map((p) => ({
    ...p,
    recommendedScopes:
      recExtra[p.slug] && recExtra[p.slug].length > 0 ? recExtra[p.slug] : p.recommendedScopes,
    readScopes: read[p.slug] && read[p.slug].length > 0 ? read[p.slug] : p.readScopes,
  }))
}

async function main() {
  const soft = process.argv.includes('--soft')
  const errors: string[] = []
  const warnings: string[] = []
  const totals: Counters = { oauthTotal: 0, withRead: 0 }

  for (const vertical of VERTICALS) {
    const platforms = await loadPlatforms(vertical)
    let oauthTotal = 0
    let withRead = 0

    for (const p of platforms) {
      const isOAuth = OAUTH_AUTH_TYPES.has(p.auth_type ?? '')
      const read = p.readScopes
      const where = `${vertical}/${p.slug}`

      const audit = AUDIT[where]

      // Strings the provider's own documentation does not contain. Checked for
      // both maps because the picker offers the catalogue to operators, who
      // then save those values into platform config — which is how a
      // fabricated scope reaches a live authorize request.
      if (audit?.invalidScopes?.length) {
        const bad = new Set(audit.invalidScopes)
        const offending = [...(read ?? []), ...(p.recommendedScopes ?? [])].filter((s) =>
          bad.has(s),
        )
        if (offending.length > 0) {
          errors.push(
            `${where}: ships scope(s) the audit found do not exist: ${[...new Set(offending)].join(', ')} (see ${audit.evidenceUrl})`,
          )
        }
      }

      if (audit?.verdict === 'no_read_only' && read && read.length > 0) {
        errors.push(
          `${where}: audit found this provider cannot express read-only through scopes, so a readScopes entry misrepresents what a read_only link grants (see ${audit.evidenceUrl})`,
        )
      }

      if (read !== undefined) {
        if (!Array.isArray(read) || read.length === 0) {
          errors.push(`${where}: readScopes is empty — omit the field to mean "platform default".`)
          continue
        }
        if (!isOAuth) {
          errors.push(
            `${where}: non-OAuth adapter (auth_type=${p.auth_type}) must not declare readScopes.`,
          )
          continue
        }
        const catalog = p.recommendedScopes
        if (catalog && catalog.length > 0) {
          const off = read.filter((s) => !catalog.includes(s))
          if (off.length > 0) {
            errors.push(`${where}: readScopes not in recommendedScopes catalog: ${off.join(', ')}`)
          }
        } else {
          warnings.push(
            `${where}: has readScopes but no recommendedScopes catalog to validate against.`,
          )
        }
      }

      if (isOAuth) {
        oauthTotal++
        if (read && read.length > 0) withRead++
      }
    }

    totals.oauthTotal += oauthTotal
    totals.withRead += withRead
    const pct = oauthTotal > 0 ? Math.round((withRead / oauthTotal) * 100) : 100
    console.log(
      `${vertical.padEnd(18)} OAuth ${String(withRead).padStart(3)}/${String(oauthTotal).padStart(3)} have readScopes (${pct}%)`,
    )
  }

  const pctAll =
    totals.oauthTotal > 0 ? Math.round((totals.withRead / totals.oauthTotal) * 100) : 100
  console.log(
    `\nTOTAL: ${totals.withRead}/${totals.oauthTotal} OAuth adapters have readScopes (${pctAll}%)`,
  )

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
    console.log('\n✓ No readScopes integrity errors.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
