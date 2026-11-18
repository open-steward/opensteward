/**
 * Fortnox's `/3/invoices` LIST endpoint does not return `InvoiceRows` — line
 * items require a per-invoice fetch. `listInvoices` and `getInvoice` share one
 * `transformInvoice`, and that transform did `(raw.InvoiceRows ?? []).map(...)`,
 * so the list path published a 2 000,00 SEK invoice as `lineItems: []`.
 *
 * `[]` is a positive assertion that the collection is empty. Asserting it
 * falsely is worse than saying nothing: a consumer computing "invoices with no
 * line items" gets a wrong answer with no way to detect it.
 *
 * The distinction the adapter can honestly make is between the key being
 * absent and the source returning an empty array. It cannot detect a platform
 * that returns `[]` for a document that really has rows — that would be the
 * platform lying, and papering over it would mean guessing.
 */
import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/invoice'
import { transformCreditMemo } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/creditmemo'
import { transformOrder } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/order'
import { transformPurchaseOrder } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/purchaseorder'
import { transformSalesOrder } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/salesorder'
import { transformExpense } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/expense'
import { transformJournal } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/journal'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Fortnox distinguishes "not reported" from "empty"', () => {
  it('returns null when the list endpoint omitted InvoiceRows', () => {
    const row = transformInvoice({ DocumentNumber: '1', Total: 2000 } as any)
    expect(row.lineItems).toBeNull()
    expect(row.lineItems).not.toEqual([])
    expect(() => InvoiceSchema.parse(row)).not.toThrow()
  })

  it('returns [] when the source explicitly reported an empty collection', () => {
    const row = transformInvoice({ DocumentNumber: '1', InvoiceRows: [] } as any)
    expect(row.lineItems).toEqual([])
    expect(row.lineItems).not.toBeNull()
  })

  it('still maps rows when the source supplied them', () => {
    const row = transformInvoice({
      DocumentNumber: '1',
      InvoiceRows: [{ RowId: 1, Price: 250, OrderedQuantity: 2, Total: 500, VAT: 125 }],
    } as any)
    expect(row.lineItems).toHaveLength(1)
    expect(row.lineItems![0]!.unitAmount).toBe(25000)
  })

  it.each([
    ['credit memo', (r: any) => transformCreditMemo(r), 'InvoiceRows'],
    ['order', (r: any) => transformOrder(r), 'OrderRows'],
    ['sales order', (r: any) => transformSalesOrder(r), 'OrderRows'],
    ['purchase order', (r: any) => transformPurchaseOrder(r), 'PurchaseOrderRows'],
    ['expense', (r: any) => transformExpense(r), 'ExpenseRows'],
    ['journal', (r: any) => transformJournal(r), 'VoucherRows'],
  ])('%s reports null when its rows key is absent', (_label, run, rowsKey) => {
    expect(run({ DocumentNumber: '1', VoucherNumber: 1, VoucherSeries: 'A' }).lineItems).toBeNull()
    expect(
      run({ DocumentNumber: '1', VoucherNumber: 1, VoucherSeries: 'A', [rowsKey]: [] }).lineItems,
    ).toEqual([])
  })
})
