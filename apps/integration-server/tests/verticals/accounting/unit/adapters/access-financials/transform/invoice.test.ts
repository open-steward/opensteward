/**
 * Sales transaction enquiry header → Invoice.
 *
 * The fixture uses the fields the "Query Transaction Headers" example on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/sales-transactions
 * selects. That page shows no response for the enquiry, so the values are
 * the ones its "Get Batched Sales Transaction" response shows for the same
 * transaction ("headerReference": "90052", "code": "GB-12672", "date":
 * "2024-04-29T00:00:00", "net": 100 ...), in the enquiry's `DateOnly`
 * format ("Format is `yyyy-MM-dd`").
 */
import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { salesHeader } from '../fixtures'

describe('transformInvoice (access-financials)', () => {
  it('parses as a canonical Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(salesHeader()))).not.toThrow()
  })

  it('takes its id from auditNo, the enquiry key getInvoice filters on', () => {
    expect(transformInvoice(salesHeader()).id).toBe('158658')
  })

  it('maps headerRef to invoiceNumber and the account code to the customer contact id', () => {
    const inv = transformInvoice(salesHeader())
    expect(inv.type).toBe('INVOICE')
    expect(inv.invoiceNumber).toBe('90052')
    expect(inv.contactId).toBe('cust_GB-12672')
  })

  it('maps customerRef to reference, and leaves an empty one out', () => {
    expect(transformInvoice(salesHeader({ customerRef: 'PO-77' })).reference).toBe('PO-77')
    expect(transformInvoice(salesHeader({ customerRef: '' })).reference).toBeUndefined()
  })

  it('keeps DateOnly values as calendar dates', () => {
    const inv = transformInvoice(
      salesHeader({ transactionDate: '2024-04-29', dueDate: '2024-05-29' }),
    )
    expect(inv.postedAt).toBe('2024-04-29')
    expect(inv.dueAt).toBe('2024-05-29')
  })

  it('reports no money and no currency: the home currency is not documented', () => {
    const inv = transformInvoice(salesHeader())
    for (const k of [
      'currency',
      'totalAmount',
      'taxAmount',
      'paidAmount',
      'balanceAmount',
    ] as const) {
      expect(inv[k]).toBeUndefined()
    }
    expect(inv.status).toBeUndefined()
  })

  it('keeps the raw row in metadata', () => {
    expect(transformInvoice(salesHeader()).metadata).toMatchObject({
      gross: 100,
      currencySymbol: 'GBP',
    })
  })

  it('leaves absent optional fields out rather than inventing them', () => {
    const inv = InvoiceSchema.parse(
      transformInvoice({ auditNo: 1, headerRef: null, accountCode: null, transactionDate: null }),
    )
    expect(inv.id).toBe('1')
    expect(inv.invoiceNumber).toBeUndefined()
    expect(inv.contactId).toBeUndefined()
    expect(inv.postedAt).toBeUndefined()
  })
})
