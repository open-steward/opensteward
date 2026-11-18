/**
 * CI guard: every platform listed in a vertical's `platforms/metadata.ts`
 * must have a matching constructor in that vertical's `adapter/factories.ts`.
 *
 * Why: the AdapterRegistry only learns about an adapter through
 * `ADAPTER_FACTORIES`. A slug that appears in metadata (so it shows up in
 * `/v1/<vertical>/platforms` and the admin UI) but has no factory throws
 * `"unknown adapter slug"` the moment an operator tries to enable it — a
 * broken, list-but-can't-connect state. This check fails closed on that gap.
 *
 * It also warns (non-fatal) on the reverse: a factory with no metadata entry,
 * which is connectable programmatically but invisible in the UI/catalog.
 *
 * A metadata entry marked `unsupported: { reason, issueUrl? }` (see
 * `packages/shared/src/reference/platform-status.ts`) is allowed to have no
 * factory too — same as `KNOWN_GAPS` — because it's *deliberately*
 * list-but-can't-connect: enabling it is refused server-side with
 * `PLATFORM_UNSUPPORTED` before the registry is ever consulted, so the
 * "unknown adapter slug" throw this check exists to prevent can't happen.
 *
 * Slugs are parsed statically from source (no importing the full adapter
 * graph): metadata entries as `slug: '<slug>'`, factory keys as
 * `<slug>: factory(` / `'<slug>': factory(`. `unsupported` detection is also
 * regex-based, not a full parse — see `parseMetadataEntries`'s doc comment
 * for why slicing the source between consecutive `slug:` matches is a safe
 * way to scope a nested `unsupported: {...}` object to its owning entry.
 *
 * Run: `pnpm tsx scripts/check-adapter-parity.ts` (add `--soft` to report
 * without failing). Exit 0 when every metadata slug has a factory (or is
 * unsupported/a known gap), 1 otherwise.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
export const VERTICALS = [
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

/** One platform entry as parsed out of a vertical's `platforms/metadata.ts`. */
export interface MetadataEntry {
  slug: string
  /** True when this entry declares `unsupported: { ... }`. */
  unsupported: boolean
}

const SLUG_RE = /(?:^|[\s{])slug:\s*'([a-z0-9-]+)'/g
const UNSUPPORTED_RE = /(?:^|[\s,])unsupported:\s*\{/

/**
 * Parse `slug` and whether each platform entry declares `unsupported: {...}`
 * out of a `platforms/metadata.ts` source string.
 *
 * `PLATFORMS` is a flat array of sibling objects, each with EXACTLY ONE
 * `slug:` field of its own. `unsupported: { reason, issueUrl }` is a NESTED
 * object with no `slug:` inside it, so the source between one `slug:` match
 * and the next is exactly that entry's body — nested `unsupported` object
 * (and any other nested object/array field: `recommendedScopes`,
 * `readScopes`, ...) included, and never spilling into the next entry.
 *
 * Exported (rather than folded into `metadataSlugs`) so a unit test can feed
 * it fixture text directly, without touching the filesystem or the real
 * verticals.
 */
export function parseMetadataEntries(src: string): MetadataEntry[] {
  const matches = [...src.matchAll(SLUG_RE)]
  return matches.map((m, i) => {
    const start = m.index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? src.length) : src.length
    const body = src.slice(start, end)
    return { slug: m[1]!, unsupported: UNSUPPORTED_RE.test(body) }
  })
}

function metadataEntries(vertical: string): MetadataEntry[] {
  const file = join(VERTICALS_DIR, vertical, 'platforms/metadata.ts')
  if (!existsSync(file)) return []
  return parseMetadataEntries(readFileSync(file, 'utf8'))
}

function factorySlugs(vertical: string): string[] {
  const file = join(VERTICALS_DIR, vertical, 'adapter/factories.ts')
  if (!existsSync(file)) return []
  const src = readFileSync(file, 'utf8')
  // Match keys in the ADAPTER_FACTORIES object: `slug: factory(` or
  // `'slug-name': factory(` (also tolerate `=> new` style values).
  const slugs = new Set<string>()
  for (const m of src.matchAll(
    /(?:^|[\s,{])'?([a-z0-9-]+)'?\s*:\s*(?:factory\(|\([^)]*\)\s*=>)/g,
  )) {
    slugs.add(m[1])
  }
  return [...slugs]
}

export interface Issue {
  vertical: string
  slug: string
  kind: 'missing-factory' | 'orphan-factory'
}

/**
 * Known metadata-without-factory gaps. These adapters have a directory but no
 * `factories.ts` entry, so they are listed-but-not-connectable. Allowlisted so
 * the check enforces on all other slugs. Do NOT add to this list — mark the
 * platform `unsupported` with a reason (if it genuinely can't be built) or fix
 * the gap (register the factory) instead.
 */
export const KNOWN_GAPS = new Set<string>([
  'accounting/accounteer',
  'accounting/dolibarr',
  'accounting/erpnext',
  'accounting/frontaccounting',
  'accounting/kora',
  'accounting/kwara',
  'accounting/mazuma',
  'accounting/paga',
  'accounting/sagebusinesscloud',
  'accounting/sila',
  'accounting/smacc',
  'accounting/uhasibu',
])

/**
 * Compute missing-factory errors and orphan-factory warnings for one
 * vertical's already-parsed metadata entries and factory slug set. Pure —
 * exported so a test can drive it directly with fixture entries instead of
 * real metadata/factories files.
 */
export function diffParity(
  vertical: string,
  entries: readonly MetadataEntry[],
  factorySlugSet: ReadonlySet<string>,
  knownGaps: ReadonlySet<string> = KNOWN_GAPS,
): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const metaSlugs = new Set(entries.map((e) => e.slug))
  for (const entry of entries) {
    if (
      !factorySlugSet.has(entry.slug) &&
      !entry.unsupported &&
      !knownGaps.has(`${vertical}/${entry.slug}`)
    ) {
      errors.push({ vertical, slug: entry.slug, kind: 'missing-factory' })
    }
  }
  for (const slug of factorySlugSet) {
    if (!metaSlugs.has(slug)) warnings.push({ vertical, slug, kind: 'orphan-factory' })
  }
  return { errors, warnings }
}

function main(): void {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  let metaTotal = 0

  for (const vertical of VERTICALS) {
    const entries = metadataEntries(vertical)
    const fac = new Set(factorySlugs(vertical))
    metaTotal += entries.length
    const { errors: vErrors, warnings: vWarnings } = diffParity(vertical, entries, fac)
    errors.push(...vErrors)
    warnings.push(...vWarnings)
  }

  const soft = process.argv.includes('--soft')

  if (warnings.length > 0) {
    console.warn(
      `adapter parity: ${warnings.length} factory(ies) with no metadata entry (UI-invisible):`,
    )
    for (const w of warnings)
      console.warn(`  - ${w.vertical}/${w.slug}: in factories.ts but not metadata.ts`)
  }

  if (errors.length === 0) {
    const gapNote = KNOWN_GAPS.size > 0 ? ` (${KNOWN_GAPS.size} pre-existing gaps allowlisted)` : ''
    console.log(`adapter parity: OK (${metaTotal} metadata slugs, all have a factory${gapNote})`)
    process.exit(0)
  }

  const stream = soft ? console.warn : console.error
  stream(
    `adapter parity: ${errors.length} metadata slug(s) with NO factory (would throw "unknown adapter slug" on enable):`,
  )
  for (const e of errors) {
    stream(
      `  - ${e.vertical}/${e.slug}: listed in platforms/metadata.ts but missing from ` +
        `adapter/factories.ts — add \`${e.slug}: factory(${e.slug.replace(/(^|-)([a-z])/g, (_, _d, c) => c.toUpperCase())}Adapter)\`, or mark it \`unsupported\` if it genuinely can't be built.`,
    )
  }
  process.exit(soft ? 0 : 1)
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
