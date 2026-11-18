#!/usr/bin/env node
/**
 * CI guard: canonical schema FIELD names are camelCase.
 *
 * The canonical schemas are the product's public vocabulary — they generate the
 * OpenAPI spec, the SDK, the CLI and every MCP tool description — so a casing
 * outlier is a permanent wart the moment anyone pins to it. `lineitems` was one
 * of those, sitting among `totalAmount`, `contactId`, `postedAt` and
 * `billingAddress`, while ecommerce had already spelled the same concept
 * `lineItems`.
 *
 * Scope is deliberately narrow: object FIELD names inside canonical schemas.
 * Resource-type slugs and URL path segments (`salesorders`, `creditmemos`,
 * `taxrates`) are not field names and are none of this guard's business.
 *
 * The CRM vertical is allowlisted, not exempt. Its six domain schemas are
 * wholesale snake_case (`first_name`, `contact_id`, `created_at`, …), which is
 * a real inconsistency — but renaming them is not the mechanical job
 * `lineitems` was: those tokens also name UPSTREAM payload fields, with ~1,100
 * `raw.<field>` reads that must NOT change and ~10,000 further positions that
 * need case-by-case reading. Doing it blind would silently break adapters, and
 * nothing validates transform output in production to catch that. It needs its
 * own pass with the typechecker as the oracle.
 *
 * Run: `pnpm tsx scripts/check-schema-field-casing.ts` (add `--soft` to report
 * without failing).
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
const SHARED_SCHEMAS = join(REPO_ROOT, 'packages/shared/src/schemas')
const SOFT = process.argv.includes('--soft')

/**
 * Verticals whose schemas are known-inconsistent and tracked for their own
 * rename. Deleting an entry is how that rename lands.
 */
const ALLOWLIST = new Set(['crm'])

/**
 * A field declaration whose value is a Zod expression: `  someName: z.string()`,
 * `  someName: nullish(Amount)`, `  someName: IsoDatetime`. Requiring the Zod
 * shape keeps plain lookup tables out — `MINOR_UNIT_EXPONENT` maps currency
 * codes (`JPY: 0`, `BHD: 3`) and those are values, not schema fields.
 */
const FIELD =
  /^\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?=z\.|nullish\(|withUnknown\(|[A-Z][A-Za-z0-9]*[.(]|[A-Z][A-Za-z0-9]*(?:Schema|Id|Datetime|Currency)\b)/gm

/**
 * REQUEST-body schemas are excluded. This repo spells request and query
 * parameters in snake_case on purpose — `connection_id`, `callback_url`,
 * `updated_after` — and only RESPONSE resource fields in camelCase. Flagging
 * `tenant_id` in `UpdateConnectionBodySchema` would be pushing a resource
 * convention onto the wire contract for requests, which is a different
 * vocabulary with its own consistency.
 */
const REQUEST_BODY_BLOCK = /export const \w*Body\w*Schema[\s\S]*?\n\)?\}?\)/g

/**
 * `RESOURCE_SCHEMAS` in each `schema/classification.ts` maps resource-type
 * slugs (`taxrates`, `payment_methods`, as in sync/listable-resources.ts) to
 * their schemas. Its keys are slugs, not fields — see the scope note above —
 * but `taxrates: TaxRateSchema` has exactly the shape FIELD looks for.
 */
const RESOURCE_SCHEMAS_BLOCK = /export const RESOURCE_SCHEMAS\b[^\n]*\{[\s\S]*?\n\}/g

/**
 * Lowercase compounds that should be camelCase, listed explicitly.
 *
 * This is the guard's honest limit. snake_case is mechanically detectable — an
 * underscore is unambiguous — but `lineitems` is not: it is indistinguishable
 * from a legitimate single word like `status` or `currency` without knowing
 * that "line items" is two words. No regex can tell those apart, and the first
 * version of this guard silently failed to catch the very field it was written
 * for because of exactly that.
 *
 * So known offenders are named. A novel lowercase compound will still slip
 * through, which is a real gap — the mitigation is that adding a canonical
 * field is a deliberate, reviewed act, and this list is the place to record the
 * spelling when one is spotted.
 */
const LOWERCASE_COMPOUNDS = new Set([
  'lineitems',
  'taxrates',
  'creditmemos',
  'salesorders',
  'purchaseorders',
  'duedate',
  'postedat',
  'firstname',
  'lastname',
])

/** camelCase, and not a known lowercase compound. */
function isCamel(name: string): boolean {
  // Compared as-is: the set holds WRONG spellings, so a correctly cased
  // `lineItems` must pass. Lowercasing first rejected the very name we want.
  if (LOWERCASE_COMPOUNDS.has(name)) return false
  return /^[a-z][a-zA-Z0-9]*$/.test(name)
}

const offenders: string[] = []
const allowlisted: string[] = []
let scanned = 0

function scan(file: string, label: string, vertical: string): void {
  scanned++
  let src = readFileSync(file, 'utf8')
  // Blank out request-body blocks and the resource-slug map so neither is
  // reported, while keeping byte offsets intact for accurate line numbers.
  const blank = (block: string) => block.replace(/[^\n]/g, ' ')
  src = src.replace(REQUEST_BODY_BLOCK, blank).replace(RESOURCE_SCHEMAS_BLOCK, blank)
  for (const m of src.matchAll(FIELD)) {
    const name = m[1]!
    if (isCamel(name)) continue
    const line = src.slice(0, m.index).split('\n').length
    const entry = `${label}:${line} — ${name}`
    ;(ALLOWLIST.has(vertical) ? allowlisted : offenders).push(entry)
  }
}

for (const vertical of readdirSync(VERTICALS_DIR)) {
  const dir = join(VERTICALS_DIR, vertical, 'schema')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.ts')) scan(join(dir, f), `${vertical}/schema/${f}`, vertical)
  }
}
if (existsSync(SHARED_SCHEMAS)) {
  for (const f of readdirSync(SHARED_SCHEMAS)) {
    if (f.endsWith('.ts')) scan(join(SHARED_SCHEMAS, f), `shared/schemas/${f}`, 'shared')
  }
}

console.log(`schema field casing: ${scanned} schema file(s) scanned`)

if (offenders.length === 0) {
  console.log(
    `✓ Every canonical schema field is camelCase` +
      (allowlisted.length
        ? ` (${allowlisted.length} allowlisted in: ${[...ALLOWLIST].join(', ')}).`
        : '.'),
  )
  process.exit(0)
}

console.error(`\n✗ ${offenders.length} schema field(s) are not camelCase:\n`)
for (const o of offenders.slice(0, 40)) console.error(`  - ${o}`)
if (offenders.length > 40) console.error(`  … and ${offenders.length - 40} more`)
console.error(
  `\nCanonical field names are the product's public vocabulary — they reach the\n` +
    `OpenAPI spec, SDK, CLI and every MCP tool description. Rename before anyone pins to it.`,
)
process.exit(SOFT ? 0 : 1)
