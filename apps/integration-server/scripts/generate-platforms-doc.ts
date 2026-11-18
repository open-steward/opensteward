/**
 * Auto-generates docs/platforms/platforms.md from each vertical's PLATFORMS
 * metadata array. One flat alphabetised table across every vertical, with
 * the `vertical` column up front so consumers can grep for "all the CRM
 * platforms" or "everything from country X" without hunting through 4 files.
 *
 * Webhook capability is detected by walking each adapter directory for a
 * `webhook.ts` module.
 *
 * `normalizeRow`, `buildUnsupportedSection` and `buildVerificationSection` are
 * exported as pure functions (no filesystem access) so a unit test can
 * exercise the `unsupported` and `verification` fields with a fixture, without
 * importing the real metadata or writing real files — everything else in this
 * module runs only inside `main()`, guarded below so merely importing it (as
 * the test does) has no side effects.
 *
 * The `Verified` column and the "## Verification" section come from each
 * platform's optional `verification` tier. Which rung an adapter sits on is
 * metadata; the provenance behind the claim lives in
 * `scripts/adapter-verification-audit.json` and is enforced by
 * `pnpm check:adapter-verification`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

import { PLATFORMS as ACCOUNTING } from '../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM } from '../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE } from '../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS } from '../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as PAYMENTS } from '../src/verticals/payments/platforms/metadata'
import { PLATFORMS as DOCSIGN } from '../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS } from '../src/verticals/projects/platforms/metadata'
import { PLATFORMS as SUPPORT } from '../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INVENTORY } from '../src/verticals/inventory/platforms/metadata'
import {
  reference,
  isVerificationTier,
  VERIFICATION_LABELS,
  VERIFICATION_README_SENTENCE,
  VERIFICATION_TIERS,
  verificationReadmeSentence,
  verificationTally,
  type VerificationTier,
} from '@opensteward/shared'
import { extractDomain } from '@opensteward/codegen'

const COUNTRY_NAMES = reference.COUNTRY_NAMES
const AUTH_LABELS = reference.AUTH_TYPE_LABELS as Record<string, string>

interface PlatformRow {
  vertical: string
  slug: string
  name: string
  description?: string
  website?: string
  category?: string
  primary_color?: string
  auth_type?: string
  hq_country?: string
  docs_url?: string
}

const SOURCES: Array<{ vertical: string; rows: readonly PlatformRow[] }> = [
  { vertical: 'accounting', rows: ACCOUNTING as unknown as PlatformRow[] },
  { vertical: 'crm', rows: CRM as unknown as PlatformRow[] },
  { vertical: 'ecommerce', rows: ECOMMERCE as unknown as PlatformRow[] },
  { vertical: 'logistics', rows: LOGISTICS as unknown as PlatformRow[] },
  { vertical: 'payments', rows: PAYMENTS as unknown as PlatformRow[] },
  { vertical: 'docsign', rows: DOCSIGN as unknown as PlatformRow[] },
  { vertical: 'projects', rows: PROJECTS as unknown as PlatformRow[] },
  { vertical: 'customer-support', rows: SUPPORT as unknown as PlatformRow[] },
  { vertical: 'inventory', rows: INVENTORY as unknown as PlatformRow[] },
]

function webhookSlugsFor(vertical: string): Set<string> {
  const dir = path.resolve(__dirname, `../src/verticals/${vertical}/adapters`)
  const slugs = new Set<string>()
  if (!existsSync(dir)) return slugs
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      if (readdirSync(path.join(dir, entry.name)).includes('webhook.ts')) {
        slugs.add(entry.name)
      }
    } catch {
      /* ignore */
    }
  }
  return slugs
}

/** Mirrors `packages/shared/src/reference/platform-status.ts`'s
 *  `UnsupportedPlatform` structurally — this script does not depend on
 *  `@opensteward/shared` for it, since the field is read off the metadata
 *  entry as plain `unknown` data (see `normalizeUnsupported`). */
export interface NormalizedUnsupported {
  reason: string
  issueUrl?: string
}

export interface NormalizedRow {
  vertical: string
  slug: string
  name: string
  description: string
  website: string
  category: string
  primary_color: string
  auth_type: string
  auth_label: string
  hq_country: string
  country_label: string
  docs_url: string
  pricing_url: string
  founded_year: number | null
  webhook: boolean
  /** Bare hostname from `website`, e.g. `stripe.com`. Consumed by
   *  platforms-ui to build Brandfetch CDN URLs when LOGO_SOURCE=cdn. */
  domain: string
  /** True when `docs/integrate/<vertical>/<slug>.md` exists. Consumed by
   *  platforms-ui to render a "Guide" link next to API/Website/Docs. */
  has_guide: boolean
  /** Present when the platform is listed and viewable but cannot be enabled
   *  or connected. Absent (not merely falsy) when the platform is fully
   *  supported, so `JSON.stringify` omits the key entirely — this is what
   *  keeps `platforms.json` byte-identical while nothing is marked
   *  unsupported. */
  unsupported?: NormalizedUnsupported
  /** How far the adapter has been exercised. Absent (not merely falsy) for
   *  an unverified platform, on the same reasoning as `unsupported` above:
   *  `JSON.stringify` drops the key, so every platform nobody has verified
   *  stays byte-identical in `platforms.json`. */
  verification?: VerificationTier
}

// NOTE: this file deliberately does NOT probe docs/platforms/logos for which
// extension each logo uses. Logos are not committed — operators opt in
// via LOGO_SOURCE (see docs/operations/platform-logos.md) — so any field
// derived from their presence on disk would make platforms.json regenerate
// differently for a maintainer who has fetched them than for a fresh clone,
// and `pnpm check:docs` would fail depending on local state. platforms-ui
// resolves the extension at runtime by trying .svg then .png instead.

const integrateRoot = path.resolve(__dirname, '../../../docs/integrate')
function guideExistsFor(vertical: string, slug: string): boolean {
  return existsSync(path.join(integrateRoot, vertical, `${slug}.md`))
}

/**
 * Reads a raw metadata entry's `unsupported` field structurally (this script
 * doesn't import the `UnsupportedPlatform` type) and normalises it to
 * `undefined` unless it is a well-formed `{ reason: string, issueUrl?: string }`
 * — so a malformed or half-written entry silently doesn't appear as
 * unsupported in the docs rather than throwing the generator.
 */
function normalizeUnsupported(raw: unknown): NormalizedUnsupported | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const reason = (raw as Record<string, unknown>).reason
  if (typeof reason !== 'string' || reason.length === 0) return undefined
  const issueUrl = (raw as Record<string, unknown>).issueUrl
  return typeof issueUrl === 'string' && issueUrl.length > 0 ? { reason, issueUrl } : { reason }
}

/**
 * Normalise one raw `platforms/metadata.ts` entry into the shape written to
 * `platforms.json` / rendered into `platforms.md`. Pure — `webhook`/`hasGuide`
 * are passed in rather than probed from disk, so a test can call this with a
 * plain fixture object.
 */
export function normalizeRow(
  vertical: string,
  p: Record<string, unknown>,
  opts: { webhook: boolean; hasGuide: boolean },
): NormalizedRow {
  const authType = String(p.auth_type ?? p.authType ?? '')
  const hqCountry = String(p.hq_country ?? p.hqCountry ?? '')
  return {
    vertical,
    slug: String(p.slug ?? ''),
    name: String(p.name ?? ''),
    description: String(p.description ?? ''),
    website: String(p.website ?? ''),
    category: String(p.category ?? ''),
    primary_color: String(p.primary_color ?? p.primaryColor ?? ''),
    auth_type: authType,
    auth_label: authType ? (AUTH_LABELS[authType] ?? authType) : '',
    hq_country: hqCountry,
    country_label: hqCountry ? (COUNTRY_NAMES[hqCountry] ?? hqCountry) : '',
    docs_url: String(p.docs_url ?? p.docsUrl ?? ''),
    pricing_url: String(p.pricing_url ?? p.pricingUrl ?? ''),
    founded_year:
      typeof p.founded_year === 'number'
        ? p.founded_year
        : typeof p.foundedYear === 'number'
          ? p.foundedYear
          : null,
    webhook: opts.webhook,
    domain: extractDomain(String(p.website ?? '')),
    has_guide: opts.hasGuide,
    unsupported: normalizeUnsupported(p.unsupported),
    // A typo or a retired tier name reads as unverified rather than
    // rendering a badge nobody can account for. Same defensive posture as
    // `normalizeUnsupported` above.
    verification: isVerificationTier(p.verification) ? p.verification : undefined,
  }
}

/**
 * Renders the "## Verification" section: the honest ratio of adapters that
 * have actually been exercised, plus a table of every one that has. Returns
 * `[]` when nothing is verified, so splicing it into `platforms.md` is a
 * no-op on a catalog where nobody has made a claim yet — the same
 * byte-identical discipline `buildUnsupportedSection` follows.
 */
export function buildVerificationSection(rows: readonly NormalizedRow[]): string[] {
  const verified = rows.filter(
    (r): r is NormalizedRow & { verification: VerificationTier } => r.verification !== undefined,
  )
  if (verified.length === 0) return []
  const byTier = VERIFICATION_TIERS.map((tier) => ({
    tier,
    rows: verified.filter((r) => r.verification === tier),
  })).filter((g) => g.rows.length > 0)
  return [
    '',
    '## Verification',
    '',
    `${verified.length} of ${rows.length} adapters have been exercised beyond scaffolding ` +
      `(${byTier.map((g) => `${VERIFICATION_LABELS[g.tier].toLowerCase()}: ${g.rows.length}`).join(', ')}). ` +
      'Every other platform in the table above ships an adapter that has never been run ' +
      'against its real API. Provenance for each claim below — who verified it, when, and ' +
      'against what — is recorded in `scripts/adapter-verification-audit.json`.',
    '',
    '| Vertical | Slug | Platform | Verified |',
    '|---|---|---|---|',
    // Strongest claims first: a reader scanning this wants the adapters
    // someone has actually driven against the platform's API at the top.
    ...byTier
      .slice()
      .reverse()
      .flatMap((g) =>
        g.rows.map(
          (r) => `| ${r.vertical} | \`${r.slug}\` | ${r.name} | ${VERIFICATION_LABELS[g.tier]} |`,
        ),
      ),
  ]
}

/**
 * Renders the "## Unsupported platforms" section as an array of lines
 * (each element becomes one line once joined), or `[]` when no row is
 * unsupported — so splicing this into `platforms.md`'s lines is a total
 * no-op today and the file stays byte-identical until a platform is marked.
 */
export function buildUnsupportedSection(rows: readonly NormalizedRow[]): string[] {
  const unsupportedRows = rows.filter(
    (r): r is NormalizedRow & { unsupported: NormalizedUnsupported } => r.unsupported !== undefined,
  )
  if (unsupportedRows.length === 0) return []
  return [
    '',
    '## Unsupported platforms',
    '',
    'Listed and viewable, but cannot be enabled or connected on this deployment.',
    '',
    '| Vertical | Slug | Platform | Reason | Issue |',
    '|---|---|---|---|---|',
    ...unsupportedRows.map(
      (r) =>
        `| ${r.vertical} | \`${r.slug}\` | ${r.name} | ${r.unsupported.reason} | ${
          r.unsupported.issueUrl ? `[link](${r.unsupported.issueUrl})` : '—'
        } |`,
    ),
  ]
}

/**
 * README.md with its verification sentence replaced by `sentence`. The rest of
 * the README is hand-written, so this touches that one sentence only, and it
 * throws unless the sentence is there exactly once: a reworded README must
 * fail the regeneration, not silently stop being updated.
 */
export function withReadmeTally(readme: string, sentence: string): string {
  const pattern = new RegExp(VERIFICATION_README_SENTENCE.source, 'g')
  const found = readme.match(pattern)?.length ?? 0
  if (found !== 1) {
    throw new Error(
      `README.md must contain the verification sentence exactly once, found ${found}. ` +
        `It reads like: ${sentence}`,
    )
  }
  return readme.replace(pattern, sentence)
}

function main(): void {
  const allRows: NormalizedRow[] = []
  let counts = {
    accounting: 0,
    crm: 0,
    ecommerce: 0,
    logistics: 0,
    payments: 0,
    docsign: 0,
    projects: 0,
    'customer-support': 0,
    inventory: 0,
  }

  for (const source of SOURCES) {
    const webhookSet = webhookSlugsFor(source.vertical)
    for (const p of source.rows as unknown as Array<Record<string, unknown>>) {
      counts = {
        ...counts,
        [source.vertical]: (counts as Record<string, number>)[source.vertical]! + 1,
      }
      const slug = String(p.slug ?? '')
      allRows.push(
        normalizeRow(source.vertical, p, {
          webhook: webhookSet.has(slug),
          hasGuide: guideExistsFor(source.vertical, slug),
        }),
      )
    }
  }

  allRows.sort((a, b) => {
    if (a.vertical !== b.vertical) return a.vertical.localeCompare(b.vertical)
    return a.slug.localeCompare(b.slug)
  })

  const total = allRows.length
  const verifiedCount = allRows.filter((r) => r.verification !== undefined).length
  const lines = [
    `# Supported Platforms`,
    '',
    `${total} platforms across ${SOURCES.length} verticals (accounting: ${counts.accounting}, crm: ${counts.crm}, ecommerce: ${counts.ecommerce}, logistics: ${counts.logistics}, payments: ${counts.payments}, docsign: ${counts.docsign}, projects: ${counts.projects}, customer-support: ${counts['customer-support']}, inventory: ${counts.inventory}).`,
    '',
    `> **Auto-generated** from each vertical's \`src/verticals/<name>/platforms/metadata.ts\`.`,
    `> Re-generate with \`pnpm --filter integration-server run generate:platforms-doc\`.`,
    '',
    // Breadth without depth over-claims. Say so at the top, where someone
    // reading "1,545 platforms" forms their impression — not 1,545 rows down.
    ...(verifiedCount > 0
      ? [
          `> **${verifiedCount} of ${total}** adapters have been exercised beyond scaffolding.`,
          `> See [Verification](#verification) — every other one ships an adapter that has`,
          `> never been run against its real API.`,
          '',
        ]
      : []),
    '| Vertical | Slug | Platform | Country | Auth | Webhooks | Verified |',
    '|---|---|---|---|---|---|---|',
    ...allRows.map(
      (r) =>
        `| ${r.vertical} | \`${r.slug}\` | ${r.name} | ${r.country_label || '—'} | ${r.auth_label || '—'} | ${r.webhook ? '✓' : ''} | ${r.verification ? VERIFICATION_LABELS[r.verification] : ''} |`,
    ),
    ...buildVerificationSection(allRows),
    ...buildUnsupportedSection(allRows),
    '',
  ]

  const outDir = path.resolve(__dirname, '../../../docs/platforms')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'platforms.md')
  writeFileSync(outPath, lines.join('\n'))
  console.log(`✓ wrote ${path.relative(process.cwd(), outPath)} (${total} platforms)`)

  const jsonPath = path.join(outDir, 'platforms.json')
  const payload = {
    generated_at: new Date('2026-04-24').toISOString().slice(0, 10),
    total,
    counts,
    platforms: allRows,
  }
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
  console.log(`✓ wrote ${path.relative(process.cwd(), jsonPath)}`)

  // The README's count of verified adapters, from the same rows, so a new
  // verification needs one regeneration and no hand edit.
  const readmePath = path.resolve(__dirname, '../../../README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const next = withReadmeTally(readme, verificationReadmeSentence(verificationTally(allRows)))
  if (next !== readme) writeFileSync(readmePath, next)
  console.log(
    `✓ ${next !== readme ? 'updated' : 'checked'} ${path.relative(process.cwd(), readmePath)} verification count`,
  )
}

// This file compiles/typechecks as CommonJS (no "type": "module" in this
// package's package.json), so `require.main === module` — not
// `import.meta.url` — is the CJS-safe way to detect "run directly" vs
// "imported" (the latter is what the test importing `normalizeRow` /
// `buildUnsupportedSection` does, and must not trigger `main()`'s writes).
const isMain = require.main === module
if (isMain) main()
