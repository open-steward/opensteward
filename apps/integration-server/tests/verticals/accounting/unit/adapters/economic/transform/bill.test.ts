import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type EconomicSupplierInvoice } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/bill'

function makeRaw(overrides: Partial<EconomicSupplierInvoice> = {}): EconomicSupplierInvoice {
  return {
    supplierInvoiceNumber: 'SI-001',
    supplier: { supplierNumber: 10, name: 'Supplier Co' },
    date: '2024-01-10',
    dueDate: '2024-02-10',
    currency: 'DKK',
    amount: 1000,
    remainder: 1000,
    vatAmount: 250,
    booked: false,
    ...overrides,
  }
}

describe('economic transformBill', () => {
  it('maps supplierInvoiceNumber to id', () => {
    expect(transformBill(makeRaw()).id).toBe('SI-001')
  })
  it('handles fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })
  it('maps booked + remainder=0 -> PAID', () => {
    expect(transformBill(makeRaw({ booked: true, remainder: 0 })).status).toBe('PAID')
  })
  it('maps booked false -> DRAFT', () => {
    expect(transformBill(makeRaw({ booked: false })).status).toBe('DRAFT')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-01-10'))
  })
  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-02-10'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
