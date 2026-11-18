/**
 * The test that keeps the sandbox honest.
 *
 * A generated fixture must survive the canonical schema it was built from. If a
 * schema gains a field shape the walker does not handle, this fails here rather
 * than serving invalid data from `/test/v1/*` — which is the whole reason the
 * generator walks Zod instead of the generated spec.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildFixture, buildFixtures, reviveDates } from '@opensteward/shared'
import * as accountingSchemas from '../../src/verticals/accounting/schema'
import { InvoiceSchema } from '../../src/verticals/accounting/schema/invoice'

const SEED = { seed: 'default:accounting:invoices' }

/**
 * Every exported canonical *record* schema in the accounting vertical.
 *
 * Object roots only: the sandbox manifest only ever points at a resource shape,
 * and the bare enum schemas exported alongside them (`InvoiceStatusSchema` and
 * friends) are field types, not records.
 */
function defOf(
  node: unknown,
): { type?: string; innerType?: unknown; shape?: Record<string, unknown> } | undefined {
  const n = node as { _zod?: { def?: never }; _def?: never } | undefined
  return n?._zod?.def ?? n?._def
}

/** Peel optional/nullable wrappers to the node that carries the type. */
function coreOf(node: unknown): unknown {
  let c = node
  let d = defOf(c)
  while (d && (d.type === 'optional' || d.type === 'nullable')) {
    c = d.innerType
    d = defOf(c)
  }
  return c
}

function shapeOf(schema: z.ZodType): Record<string, unknown> {
  return (defOf(schema)?.shape ?? {}) as Record<string, unknown>
}

function isObjectSchema(v: unknown): v is z.ZodType {
  const def = (v as { _zod?: { def?: { type?: string } } })?._zod?.def
  return typeof (v as z.ZodType | undefined)?.safeParse === 'function' && def?.type === 'object'
}

const SCHEMAS = (Object.entries(accountingSchemas) as [string, unknown][]).filter(
  (entry): entry is [string, z.ZodType] => isObjectSchema(entry[1]),
)

describe('sandbox fixtures — every accounting schema round-trips', () => {
  it('finds the schemas', () => {
    expect(SCHEMAS.length).toBeGreaterThan(10)
  })

  it.each(SCHEMAS)('%s: index 0 parses', (name, schema) => {
    const fixture = buildFixture(schema, { ...SEED, index: 0 })
    const result = schema.safeParse(fixture)
    expect(
      result.success,
      result.success ? '' : `${name}: ${JSON.stringify(result.error?.issues.slice(0, 3))}`,
    ).toBe(true)
  })

  it.each(SCHEMAS)('%s: varied indices parse', (name, schema) => {
    for (const fixture of buildFixtures(schema, 4, SEED)) {
      const result = schema.safeParse(fixture)
      expect(
        result.success,
        result.success ? '' : `${name}: ${JSON.stringify(result.error?.issues.slice(0, 3))}`,
      ).toBe(true)
    }
  })

  it.each(SCHEMAS)('%s: survives a JSON round-trip once dates are revived', (name, schema) => {
    const fixture = buildFixture(schema, { ...SEED, index: 0 })
    const stored = JSON.parse(JSON.stringify(fixture)) as unknown
    const result = schema.safeParse(reviveDates(schema, stored))
    expect(
      result.success,
      result.success ? '' : `${name}: ${JSON.stringify(result.error?.issues.slice(0, 3))}`,
    ).toBe(true)
  })
})

describe('sandbox fixtures — the specific traps', () => {
  it('reproduces the documented example at index 0', () => {
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    // The docs show `inv_1042`; a sandbox that served something else would make
    // every copy-pasted example in the guides wrong.
    expect(invoice['id']).toBe('inv_1042')
    expect(invoice['invoiceNumber']).toBe('INV-1042')
    expect(invoice['totalAmount']).toBe(125000)
  })

  it('emits a real Date for z.date(), not the ISO string the example carries', () => {
    // `createdAt` is still `z.date()`. `postedAt` deliberately is not any more
    // — see the calendar-date case below — so it can no longer carry this.
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(invoice['createdAt']).toBeInstanceOf(Date)
    expect((invoice['createdAt'] as Date).toISOString()).toBe('2026-01-15T09:30:00.000Z')
  })

  it('emits a calendar-date STRING for a date-or-date-time field', () => {
    // `postedAt` is `Date | 'YYYY-MM-DD'`: an invoice date is a date, and
    // rendering it as a UTC instant invents a time and a zone. The fixture has
    // to reproduce the shape the real adapters emit, or the sandbox would
    // document a contract the live API does not honour.
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(invoice['postedAt']).toBe('2026-02-01')
    expect(InvoiceSchema.safeParse(invoice).success).toBe(true)
  })

  it('omits a field documented as null that cannot hold null', () => {
    // `cancelledAt` is `z.date().optional().meta({ example: null })` — optional
    // but NOT nullable. Copying the example verbatim is a parse error.
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect('cancelledAt' in invoice).toBe(false)
    expect(InvoiceSchema.safeParse({ cancelledAt: null }).success).toBe(false)
  })

  it('reads the outer example on a nullish() field, not the shared primitive', () => {
    // `nullish(Amount)` re-metas the field; the inner `Amount` carries its own
    // example. A depth-first read picks up the primitive's instead.
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(invoice['discountAmount']).toBe(0)
    expect(invoice['paidAmount']).toBe(125000)
  })

  it('reproduces every documented enum example at index 0', () => {
    // Enums must reproduce the documented example, not the first declared
    // member — otherwise an invoice the docs document as PAID comes back
    // DRAFT, with a full payment and a paidAt on it. Many examples coincide
    // with the first declared member, so spot-checking one field cannot catch
    // a generator that ignores examples; check every schema.
    //
    // Data-driven over every schema rather than a hand-picked field, so a new
    // schema is covered the day it lands.
    const mismatches: string[] = []
    for (const [name, schema] of SCHEMAS) {
      const fixture = buildFixture(schema, { ...SEED, index: 0 }) as Record<string, unknown>
      for (const [field, node] of Object.entries(shapeOf(schema))) {
        if (defOf(coreOf(node))?.type !== 'enum') continue
        const meta = z.globalRegistry.get(node as never) as { example?: unknown } | undefined
        if (!meta || !('example' in meta)) continue
        if (fixture[field] !== meta.example) {
          mismatches.push(
            `${name}.${field}: docs '${String(meta.example)}' vs '${String(fixture[field])}'`,
          )
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('serves an invoice that is internally coherent at index 0', () => {
    // The symptom worth naming: a DRAFT invoice with a full payment recorded
    // against it is not something any real accounting platform would return.
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(invoice['status']).toBe('PAID')
    expect(invoice['paidAmount']).toBe(125000)
    expect(invoice['balanceAmount']).toBe(0)
  })

  it('varies enums away from the index-0 value, never back onto it', () => {
    // Records that differ only by id would make a paged list look broken.
    const statuses = buildFixtures(InvoiceSchema, 8, SEED).map((i) => i['status'])
    expect(statuses[0]).toBe('PAID')
    expect(statuses.slice(1).every((s) => s !== 'PAID')).toBe(true)
  })

  it('never selects the synthetic `unknown` enum member', () => {
    // `withUnknown()` appends it to every status enum; it means "we could not
    // map the platform's value", which a sandbox should never claim.
    const statuses = buildFixtures(InvoiceSchema, 24, SEED).map((i) => i['status'])
    expect(statuses).not.toContain('unknown')
    expect(new Set(statuses).size).toBeGreaterThan(1)
  })

  it('keeps constrained strings at their example rather than mutating them', () => {
    // `Iso4217Currency` is `.length(3).regex(/^[A-Z]{3}$/)` — suffixing it to
    // make records distinct would produce data the schema rejects.
    for (const invoice of buildFixtures(InvoiceSchema, 6, SEED)) {
      expect(invoice['currency']).toBe('USD')
    }
  })

  it('is deterministic for the same seed and index', () => {
    const a = buildFixture(InvoiceSchema, { ...SEED, index: 3 })
    const b = buildFixture(InvoiceSchema, { ...SEED, index: 3 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('applies overrides last, so the caller owns record identity', () => {
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 1, overrides: { id: 'inv_x' } })
    expect(invoice['id']).toBe('inv_x')
  })

  it('emits {} for a raw passthrough record rather than inventing keys', () => {
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(invoice['metadata']).toEqual({})
  })

  it('synthesizes one element for an array that carries no example', () => {
    const invoice = buildFixture(InvoiceSchema, { ...SEED, index: 0 })
    expect(Array.isArray(invoice['lineItems'])).toBe(true)
    expect((invoice['lineItems'] as unknown[]).length).toBe(1)
  })
})
