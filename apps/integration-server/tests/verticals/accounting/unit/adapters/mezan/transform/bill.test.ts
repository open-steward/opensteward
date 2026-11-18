import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MezanPurchasingInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

// NOTE: Mezan passes unit_price and subtotal_including_tax directly as the
// canonical unitAmount/totalAmount fields (which require integer minor units).
// In tests we use integer values (e.g. 1000 = $10.00 in minor units) so
// BillSchema.parse() passes; real Mezan decimal prices would fail that guard.

function makeBill(overrides: Partial<MezanPurchasingInvoice> = {}): MezanPurchasingInvoice {
  return {
    id: 'bill_001',
    reference: 'REF-100',
    status: 'confirmed',
    issue_date: '2024-03-01',
    due_date: '2024-04-01',
    vendor_id: 'vnd_42',
    currency: 'USD',
    total: 110000,
    total_tax: 10000,
    total_paid: 110000,
    balance: 0,
    products: [],
    ...overrides,
  }
}

describe('transformBill (mezan)', () => {
  it('maps id as string', () => {
    expect(transformBill(makeBill()).id).toBe('bill_001')
  })

  it('maps reference to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('REF-100')
  })

  it('falls back to id string as billNumber when reference is absent', () => {
    expect(transformBill(makeBill({ reference: undefined })).billNumber).toBe('bill_001')
  })

  it('maps vendor_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('vnd_42')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(110000)
  })

  it('maps total_tax to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(10000)
  })

  it('maps total_paid to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(110000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(0)
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps confirmed + balance=0 to PAID', () => {
    expect(transformBill(makeBill({ status: 'confirmed', balance: 0 })).status).toBe('PAID')
  })

  it('maps confirmed + partial balance to PARTIALLY_PAID', () => {
    expect(
      transformBill(makeBill({ status: 'confirmed', balance: 50000, total: 110000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps confirmed + full balance to AUTHORIZED', () => {
    expect(
      transformBill(makeBill({ status: 'confirmed', balance: 110000, total: 110000 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps line items with integer amounts (schema-valid)', () => {
    const raw = makeBill({
      products: [
        {
          id: 'p1',
          product_name: 'Widget',
          quantity: 2,
          unit_price: 50000, // integer minor units
          subtotal: 100000,
          subtotal_including_tax: 110000,
          tax_subtotal: 10000,
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('p1')
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].unitAmount).toBe(50000)
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(110000)
    expect(result.lineItems![0].taxAmount).toBe(10000)
  })

  it('maps transaction_note to notes', () => {
    expect(transformBill(makeBill({ transaction_note: 'Net 30' })).notes).toBe('Net 30')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema validation with integer amounts', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
