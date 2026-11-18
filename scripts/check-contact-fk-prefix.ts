#!/usr/bin/env node
/**
 * CI guard: if an accounting adapter prefixes its `Contact.id`, the `contactId`
 * foreign keys pointing at that contact must carry the same prefix.
 *
 * Why: ~25 accounting adapters merge two upstream collections into one
 * canonical Contact list (Fortnox `/customers` + `/suppliers`, QuickBooks
 * customers + vendors, AFAS debtors + creditors). Those collections number
 * independently, so the adapter prefixes the id — `cust_1` vs `supp_1` — to
 * stop customer #1 colliding with supplier #1, and `getContact` dispatches on
 * that prefix.
 *
 * The failure this catches is silent and total: prefix the id but emit a bare
 * `contactId`, and `get_accounting_contacts(id=invoice.contactId)` looks up an
 * id that does not exist, finds nothing, and returns no error. Every join from
 * a document to its counterparty dangles — the one join an accounting
 * aggregator exists to serve. Fortnox had it on all six document types;
 * quickfile had it on two, masked by a tolerant `getContact` fallback.
 *
 * Nothing else catches this. Transform unit tests assert each file in
 * isolation, so an id test and an FK test both pass while disagreeing with
 * each other, and per `docs/architecture/transform-conformance.md` nothing
 * validates transform output in production at all.
 *
 * The rule is deliberately conditional. An adapter whose platform has a single
 * contact namespace has no reason to prefix, and a bare id on both sides is
 * correct there — this only fires when the two sides disagree.
 *
 * Run: `pnpm tsx scripts/check-contact-fk-prefix.ts` (add `--soft` to report
 * without failing). Exit 0 when every adapter is internally consistent.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const ADAPTERS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals/accounting/adapters')
const SOFT = process.argv.includes('--soft')

/**
 * Adapters with this defect at the time the guard landed, tracked for the
 * follow-up sweep. Allowlisted rather than soft-failing the whole check so the
 * gate is CLOSED for new drift from day one — the same shape as the
 * "pre-existing gaps allowlisted" list in check-adapter-parity.
 *
 * Fixing an adapter means deleting its line. Do not add to this list: a new
 * adapter has no excuse, and the helper exists now.
 */
const KNOWN_UNSWEPT = new Set([
  'access-financials',
  'afas',
  'autocount',
  'bigcapital',
  'colppy',
  'contpaqi',
  'economic',
  'frontaccounting',
  'invoice-ninja',
  'jalebi',
  'mazeedone',
  'mezan',
  'mri-software',
  'nuvemfiscal',
  'qoyod',
  'quickbooks',
  'reckon-one',
  'spiris',
  'visma',
])

/** Documents whose `contactId` names a counterparty, and which side it is. */
const DOCUMENTS = ['invoice', 'creditmemo', 'order', 'salesorder', 'bill', 'purchaseorder'] as const

/** Which counterparty each document's `contactId` names. */
const SIDE_OF: Record<string, 'customer' | 'supplier'> = {
  invoice: 'customer',
  creditmemo: 'customer',
  order: 'customer',
  salesorder: 'customer',
  bill: 'supplier',
  purchaseorder: 'supplier',
}

/**
 * The prefix each SIDE uses on `Contact.id`, or `null` when that side is bare.
 *
 * Read per exported transform rather than per file, because the two sides are
 * independent: `vhsys` deliberately leaves customer ids bare (only suppliers
 * need disambiguating there) and prefixes only suppliers, which is internally
 * consistent and must not be reported. Matches both the shared helper and the
 * hand-rolled template literal still present in unswept adapters.
 */
function contactPrefixBySide(adapterDir: string): {
  customer: string | null
  supplier: string | null
} {
  const out: { customer: string | null; supplier: string | null } = {
    customer: null,
    supplier: null,
  }
  const file = join(adapterDir, 'transform/contact.ts')
  if (!existsSync(file)) return out
  const src = readFileSync(file, 'utf8')

  // Split into exported transform blocks so an `id:` is attributed to the
  // function it sits in.
  const blocks = [
    ...src.matchAll(/export function (transform\w+)([\s\S]*?)(?=export function |$)/g),
  ]
  for (const [, name, body] of blocks) {
    // Naming is not English-only (vhsys uses transformCliente/transformFornecedor)
    // and not uniform, so classify on the function name OR the flags the
    // transform sets. isSupplier/isCustomer are canonical Contact fields every
    // one of these sets explicitly, which makes them the reliable signal.
    const supplierName = /supplier|vendor|creditor|fornecedor|proveedor|lieferant|leverant/i.test(
      name!,
    )
    const supplierFlag = /isSupplier:\s*true/.test(body!) && !/isCustomer:\s*true/.test(body!)
    const side = supplierName || supplierFlag ? 'supplier' : 'customer'
    const helper = body!.match(/id:\s*prefixedId\(\s*'([a-z0-9]+)'/)
    const literal = body!.match(/id:\s*`([a-z0-9]+)_\$\{/)
    const prefix = helper?.[1] ?? literal?.[1] ?? null
    if (prefix) out[side] = prefix
  }
  return out
}

/** The prefix this document transform puts on `contactId`, or null if bare. */
function fkPrefix(adapterDir: string, doc: string): string | null | undefined {
  const file = join(adapterDir, `transform/${doc}.ts`)
  if (!existsSync(file)) return undefined
  const src = readFileSync(file, 'utf8')
  const assignment = src.match(/contactId:\s*([^\n]*)/)
  if (!assignment) return undefined
  const rhs = assignment[1]!
  const helper = rhs.match(/prefixedId\(\s*'([a-z0-9]+)'/)
  const literal = rhs.match(/`([a-z0-9]+)_\$\{/)
  return helper?.[1] ?? literal?.[1] ?? null
}

const offenders: string[] = []
const known: string[] = []
let checked = 0
let prefixing = 0

for (const slug of readdirSync(ADAPTERS_DIR).sort()) {
  const dir = join(ADAPTERS_DIR, slug)
  if (slug === 'shared' || !existsSync(join(dir, 'transform'))) continue
  checked++

  const idPrefix = contactPrefixBySide(dir)
  if (!idPrefix.customer && !idPrefix.supplier) continue // single namespace — nothing to enforce
  prefixing++

  for (const doc of DOCUMENTS) {
    const side = SIDE_OF[doc]!
    const expected = idPrefix[side]
    const actual = fkPrefix(dir, doc)
    if (actual === undefined) continue // no such document, or it carries no contactId
    if (actual === expected) continue

    const target = KNOWN_UNSWEPT.has(slug) ? known : offenders
    target.push(
      expected === null
        ? `${slug}/transform/${doc}.ts — contactId is prefixed '${actual}_' but the ${side} ` +
            `Contact.id is bare`
        : `${slug}/transform/${doc}.ts — ${side} Contact.id is '${expected}_' but contactId is ` +
            (actual === null ? 'bare' : `'${actual}_'`) +
            `, so the join cannot resolve`,
    )
  }
}

console.log(
  `contact FK prefix: ${checked} accounting adapters scanned, ${prefixing} prefix their Contact.id`,
)

if (offenders.length === 0) {
  console.log(
    `✓ No new dangling contactId references` +
      (known.length
        ? ` (${known.length} pre-existing across ${KNOWN_UNSWEPT.size} allowlisted adapters).`
        : '.'),
  )
  process.exit(0)
}

console.error(`\n✗ ${offenders.length} dangling foreign-key reference(s):\n`)
for (const o of offenders) console.error(`  - ${o}`)
console.error(
  `\nUse prefixedId()/unprefixedId() from accounting/adapters/shared/transform.ts on BOTH\n` +
    `sides. Remember the write path: untransform* must strip the prefix before sending the\n` +
    `id back upstream, or the platform receives an id it has never issued.`,
)
process.exit(SOFT ? 0 : 1)
