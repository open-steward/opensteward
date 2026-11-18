import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type Bill4TimeInvoice,
  type Bill4TimeInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const sampleItems: Bill4TimeInvoiceItem[] = [
  {
    ItemId: 'ITEM-1',
    Description: 'Legal research',
    Quantity: 2,
    Rate: 300,
    Amount: 600,
    TaxAmount: 48,
  },
]

function makeRaw(overrides: Partial<Bill4TimeInvoice> = {}): Bill4TimeInvoice {
  return {
    InvoiceId: 'INV-777',
    InvoiceNumber: 'B4T-2024-001',
    ClientID: 'CLIENT-001',
    InvoiceDate: '2024-01-15',
    DueDate: '2024-02-15',
    TotalAmount: 600,
    BalanceDue: 600,
    AmountPaid: 0,
    TaxAmount: 48,
    Notes: 'Legal services rendered',
    Status: 'Sent',
    Currency: 'USD',
    InvoiceItems: sampleItems,
    ...overrides,
  }
}

describe('transformInvoice (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-777')
    expect(result.invoiceNumber).toBe('B4T-2024-001')
    expect(result.contactId).toBe('CLIENT-001')
    expect(result.currency).toBe('USD')
    // Bill4Time passes amounts directly without minor-unit conversion
    expect(result.totalAmount).toBe(600)
    expect(result.balanceAmount).toBe(600)
    expect(result.taxAmount).toBe(48)
    expect(result.type).toBe('INVOICE')
    expect(result.notes).toBe('Legal services rendered')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps Status=Sent to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ Status: 'Sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Status=Paid to PAID', () => {
    const result = transformInvoice(makeRaw({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Status=Partial to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ Status: 'Partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps Status=Void to VOIDED', () => {
    const result = transformInvoice(makeRaw({ Status: 'Void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps Status=Draft to DRAFT', () => {
    const result = transformInvoice(makeRaw({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps invoice items to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ITEM-1')
    expect(li.itemDescription).toBe('Legal research')
    expect(li.unitAmount).toBe(300)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(600)
    expect(li.taxAmount).toBe(48)
  })

  it('computes paidAmount from TotalAmount - BalanceDue when AmountPaid is absent', () => {
    const result = transformInvoice(
      makeRaw({ AmountPaid: undefined, TotalAmount: 600, BalanceDue: 200 }),
    )
    // paid = 600 - 200 = 400
    expect(result.paidAmount).toBe(400)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice (contactId, currency, notes)', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    expect(back['ClientID']).toBe('CLIENT-001')
    expect(back['Currency']).toBe('USD')
    expect(back['Notes']).toBe('Legal services rendered')
  })
})
