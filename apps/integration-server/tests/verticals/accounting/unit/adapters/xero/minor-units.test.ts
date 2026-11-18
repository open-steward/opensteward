/**
 * Xero amounts were stored 100x under contract.
 *
 * Canonical `Amount` is `z.number().int()` in minor units. Xero sends decimal
 * major units, and not one of its 13 transforms converted — 41 money
 * assignments passing the raw value straight through.
 *
 * A live sync made it concrete: an invoice stored `totalAmount: 396` for a
 * $396.00 document, and a bill stored `59.54`, which is not even an integer and
 * so violates the schema outright. Nothing validates transform output in
 * production, so both were written to the store and served to callers.
 *
 * The write direction matters equally: `untransformInvoice` posts back to Xero,
 * which expects decimals. Converting reads without converting writes would
 * create invoices for 100x their value.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
} from '../../../../../../src/verticals/accounting/adapters/xero/transform/invoice'
import { transformBill } from '../../../../../../src/verticals/accounting/adapters/xero/transform/bill'
import { transformCreditMemo } from '../../../../../../src/verticals/accounting/adapters/xero/transform/creditmemo'
import { transformPurchaseOrder } from '../../../../../../src/verticals/accounting/adapters/xero/transform/purchaseorder'
import { transformOrder } from '../../../../../../src/verticals/accounting/adapters/xero/transform/order'
import { transformTransaction } from '../../../../../../src/verticals/accounting/adapters/xero/transform/transaction'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Xero decimal amounts become integer minor units', () => {
  it('converts an invoice total, and the result satisfies the schema', () => {
    const row = transformInvoice({
      InvoiceID: 'i1', Type: 'ACCREC', Total: 396, TotalTax: 51.6, AmountDue: 12.34,
    } as any)
    expect(row.totalAmount).toBe(39600)
    expect(row.taxAmount).toBe(5160)
    expect(row.balanceAmount).toBe(1234)
    expect(() => InvoiceSchema.parse(row)).not.toThrow()
  })

  it('converts the fractional bill total that exposed this', () => {
    const row = transformBill({ InvoiceID: 'b1', Total: 59.54 } as any)
    expect(row.totalAmount).toBe(5954)
    expect(Number.isInteger(row.totalAmount)).toBe(true)
    expect(() => BillSchema.parse(row)).not.toThrow()
  })

  it.each([
    ['credit memo', () => transformCreditMemo({ CreditNoteID: 'c1', Total: 10.5 } as any)],
    ['purchase order', () => transformPurchaseOrder({ PurchaseOrderID: 'p1', Total: 10.5 } as any)],
    ['order', () => transformOrder({ PurchaseOrderID: 'p1', Total: 10.5 } as any)],
  ])('converts a %s total', (_label, run) => {
    expect((run() as { totalAmount?: number }).totalAmount).toBe(1050)
  })

  it('converts a bank transaction total', () => {
    expect(
      transformTransaction({ BankTransactionID: 't1', Total: 10.5 } as any).totalAmount,
    ).toBe(1050)
  })

  it('converts line items, not just document totals', () => {
    const row = transformInvoice({
      InvoiceID: 'i1', Type: 'ACCREC', Total: 100,
      LineItems: [
        { LineItemID: 'l1', UnitAmount: 2.5, Quantity: 4, LineAmount: 10, TaxAmount: 1.5 },
      ],
    } as any)
    expect(row.lineItems![0]!.unitAmount).toBe(250)
    expect(row.lineItems![0]!.totalAmount).toBe(1000)
  })

  it('sends decimals back to Xero on write, not minor units', () => {
    const body = untransformInvoice({
      lineItems: [{ unitAmount: 250, unitQuantity: 4 }],
    } as any) as any
    expect(body.LineItems[0].UnitAmount).toBe(2.5)
  })

  it('leaves an absent amount absent rather than turning it into zero', () => {
    const row = transformInvoice({ InvoiceID: 'i1', Type: 'ACCREC' } as any)
    expect(row.totalAmount ?? null).toBeNull()
  })
})
