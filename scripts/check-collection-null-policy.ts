#!/usr/bin/env node
/**
 * CI guard: a canonical collection field declared `nullish` must not be fed by
 * a mapper that defaults a missing source collection to `[]`.
 *
 * The rule (see `packages/shared/src/schemas/zod-helpers.ts`): `[]` is a
 * positive assertion — "this document has no line items" — not a stand-in for
 * "the source did not tell us". A mapper writing
 * `(raw.Rows ?? []).map(...)` collapses "not reported" into "empty", and the
 * result is a false statement no consumer can detect.
 *
 * That is not hypothetical. Fortnox's `/3/invoices` LIST endpoint omits
 * `InvoiceRows` (line items need a per-invoice fetch), so a 2 000,00 SEK
 * invoice was published as `lineitems: []` — the defect that prompted this
 * guard. Nothing else catches it: per `docs/architecture/transform-conformance.md`
 * nothing validates transform output in production, and `[]` parses against
 * the schema perfectly well.
 *
 * Scope is deliberately narrow — only fields this repo has widened to
 * `nullish` are enforced. `?? []` remains correct for a field whose schema
 * says the collection is always present, and appears in ~74% of adapters for
 * exactly that reason. Widening a field's schema is what opts its mappers in.
 *
 * Run: `pnpm tsx scripts/check-collection-null-policy.ts` (add `--soft` to
 * report without failing).
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const SOFT = process.argv.includes('--soft')

/**
 * Canonical fields widened to `nullish` collections, PER VERTICAL. Read from
 * the schemas rather than hardcoded, so widening a new field automatically
 * enforces it.
 *
 * Scoped per vertical, not globally, because the same field name can carry
 * different contracts in different verticals. `lineItems` is `nullish` in
 * accounting — where a platform may genuinely not report line items — but
 * plain `.optional()` in ecommerce, where `?? []` is correct and this rule
 * must not fire. A global name set enforced accounting's contract on
 * ecommerce's 100+ order transforms.
 */
function nullishCollectionFieldsByVertical(): Map<string, Set<string>> {
  const byVertical = new Map<string, Set<string>>()
  for (const vertical of readdirSync(VERTICALS_DIR)) {
    const schemaDir = join(VERTICALS_DIR, vertical, 'schema')
    if (!existsSync(schemaDir) || !statSync(schemaDir).isDirectory()) continue
    const fields = new Set<string>()
    for (const file of readdirSync(schemaDir)) {
      if (!file.endsWith('.ts')) continue
      const src = readFileSync(join(schemaDir, file), 'utf8')
      for (const m of src.matchAll(/(\w+):\s*nullish\(\s*z\.array\(/g)) fields.add(m[1]!)
    }
    if (fields.size > 0) byVertical.set(vertical, fields)
  }
  return byVertical
}

/**
 * Files that already defaulted when the rule landed, tracked for the follow-up
 * sweep. Same shape as `transform-schema-assertion-baseline.json`: a file in
 * the baseline may keep defaulting; a file OUTSIDE it may not. That closes the
 * gate for every new adapter from day one while ~1,300 pre-existing mappers are
 * converted vertical by vertical.
 *
 * Fixing a file means deleting its line from the baseline in the same change.
 */
const BASELINE: Set<string> = new Set(
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/collection-null-baseline.json'), 'utf8'),
  ) as string[],
)

const FIELDS_BY_VERTICAL = nullishCollectionFieldsByVertical()
const offenders: string[] = []
const known: string[] = []
let scanned = 0

/** `field: (raw.X ?? []).map(...)` or `field: raw.X || []` — the defaulting shapes. */
function defaultingAssignments(src: string, fields: Set<string>): string[] {
  const hits: string[] = []
  for (const field of fields) {
    const re = new RegExp(`${field}:\\s*\\(?[^\\n,]*(?:\\?\\?|\\|\\|)\\s*\\[\\]`, 'g')
    for (const m of src.matchAll(re)) hits.push(`${field} — ${m[0]!.trim()}`)
  }
  return hits
}

function walk(dir: string, fields: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, fields)
      continue
    }
    if (!entry.endsWith('.ts')) continue
    // Only canonical mappers. An adapter's `index.ts` builds OUTBOUND request
    // bodies, where the key is the PLATFORM's field name and `?? []` is
    // correct — lexoffice literally posts `lineItems: (data.lineItems ?? [])`,
    // which is a write path, not a canonical mapping. Restricting to
    // `transform/` keeps the rule pointed at the objects it governs.
    if (!full.includes('/transform/')) continue
    scanned++
    const src = readFileSync(full, 'utf8')
    const rel = full.slice(REPO_ROOT.length + 1)
    for (const hit of defaultingAssignments(src, fields)) {
      ;(BASELINE.has(rel) ? known : offenders).push(`${rel} — ${hit}`)
    }
  }
}

for (const [vertical, fields] of FIELDS_BY_VERTICAL) {
  const adaptersDir = join(VERTICALS_DIR, vertical, 'adapters')
  if (!existsSync(adaptersDir)) continue
  walk(adaptersDir, fields)
}

console.log(
  `collection null policy: ${scanned} transform files scanned, enforcing ` +
    [...FIELDS_BY_VERTICAL].map(([v, f]) => `${v}: ${[...f].sort().join('/')}`).join('; '),
)

if (offenders.length === 0) {
  console.log(
    `✓ No new nullish collection is defaulted to []` +
      (known.length ? ` (${known.length} pre-existing in the baseline).` : '.'),
  )
  process.exit(0)
}

console.error(`\n✗ ${offenders.length} collection(s) defaulted to [] instead of null:\n`)
for (const o of offenders.slice(0, 40)) console.error(`  - ${o}`)
if (offenders.length > 40) console.error(`  … and ${offenders.length - 40} more`)
console.error(
  `\nEmit null when the source omitted the key, [] only when it returned an empty\n` +
    `collection:  field: raw.Rows ? raw.Rows.map(mapRow) : null`,
)
process.exit(SOFT ? 0 : 1)
