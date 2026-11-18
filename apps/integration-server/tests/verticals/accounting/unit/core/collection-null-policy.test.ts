/**
 * Collections need the same three states the API validation policy already
 * gives scalars.
 *
 * The policy — `packages/shared/src/schemas/limits.ts` on `Amount`, and
 * `zod-helpers.ts` on `nullish` — says: `null` = upstream did not report this,
 * an explicit value = upstream reported it, key absent = upstream did not
 * supply the field. "Never coerce these three states into each other."
 *
 * Every word of that was written about SCALARS. Nothing extended it to arrays,
 * and the schemas show it: all 72 canonical array fields were `.optional()`
 * and none were nullable, so a collection had no way to say "not reported".
 * Mappers filled the gap with `?? []`, which turns "the list endpoint does not
 * return rows" into the positive assertion "this document has no rows".
 *
 * That is not a hypothetical. Fortnox's `/3/invoices` list endpoint omits
 * `InvoiceRows` entirely — they need a per-invoice fetch — so a 2 000,00 SEK
 * invoice was published as `lineItems: []`. A consumer counting invoices with
 * no line items for a data-quality check gets a wrong answer and no way to
 * detect it.
 *
 * Widening to `nullish` is what lets an adapter tell the truth. `[]` keeps its
 * meaning — the source really did return an empty collection.
 */
import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../src/verticals/accounting/schema/bill'
import { CreditMemoSchema } from '../../../../../src/verticals/accounting/schema/creditmemo'
import { ExpenseSchema } from '../../../../../src/verticals/accounting/schema/expense'
import { JournalSchema } from '../../../../../src/verticals/accounting/schema/journal'
import { OrderSchema } from '../../../../../src/verticals/accounting/schema/order'
import { PurchaseOrderSchema } from '../../../../../src/verticals/accounting/schema/purchaseorder'
import { SalesOrderSchema } from '../../../../../src/verticals/accounting/schema/salesorder'
import { TransactionSchema } from '../../../../../src/verticals/accounting/schema/transaction'

const SCHEMAS = [
  ['invoice', InvoiceSchema],
  ['bill', BillSchema],
  ['creditmemo', CreditMemoSchema],
  ['expense', ExpenseSchema],
  ['journal', JournalSchema],
  ['order', OrderSchema],
  ['purchaseorder', PurchaseOrderSchema],
  ['salesorder', SalesOrderSchema],
  ['transaction', TransactionSchema],
] as const

describe('lineItems carries all three states', () => {
  it.each(SCHEMAS)('%s accepts null — upstream did not report line items', (_name, schema) => {
    expect(schema.safeParse({ lineItems: null }).success).toBe(true)
  })

  it.each(SCHEMAS)('%s accepts [] — upstream reported an empty collection', (_name, schema) => {
    expect(schema.safeParse({ lineItems: [] }).success).toBe(true)
  })

  it.each(SCHEMAS)('%s accepts the key being absent entirely', (_name, schema) => {
    expect(schema.safeParse({}).success).toBe(true)
  })

  it.each(SCHEMAS)('%s still rejects a non-array', (_name, schema) => {
    expect(schema.safeParse({ lineItems: 'nope' }).success).toBe(false)
  })

  it('keeps null and [] distinguishable after a parse round-trip', () => {
    const notReported = InvoiceSchema.parse({ lineItems: null })
    const reportedEmpty = InvoiceSchema.parse({ lineItems: [] })
    expect(notReported.lineItems).toBeNull()
    expect(reportedEmpty.lineItems).toEqual([])
    expect(notReported.lineItems).not.toEqual(reportedEmpty.lineItems)
  })
})
