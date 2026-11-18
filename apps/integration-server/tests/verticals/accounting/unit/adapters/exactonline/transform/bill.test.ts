import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ExactBill } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/bill'

function makeBill(overrides: Partial<ExactBill> = {}): ExactBill {
  return { EntryID: 'e-1', InvoiceNumber: 'PI-001', Supplier: 's-guid', AmountDC: 1210, VATAmountDC: 210, Status: 20, EntryDate: '2024-03-01', ...overrides }
}

describe('transformBill (exactonline)', () => {
  it('maps id, billNumber, contactId', () => {
    const r = transformBill(makeBill())
    expect(r.id).toBe('e-1')
    expect(r.billNumber).toBe('PI-001')
    expect(r.contactId).toBe('s-guid')
  })
  it('Status 10 → DRAFT', () => {
    expect(transformBill(makeBill({ Status: 10 })).status).toBe('DRAFT')
  })
  it('Status 20 → AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 20 })).status).toBe('AUTHORIZED')
  })
  it('Status 50 → PAID', () => {
    expect(transformBill(makeBill({ Status: 50 })).status).toBe('PAID')
  })
  it('maps amounts', () => {
    const r = transformBill(makeBill())
    expect(r.totalAmount).toBe(1210)
    expect(r.taxAmount).toBe(210)
  })
  it('passes raw as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
