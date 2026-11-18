import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FattureCloudBill } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/bill'

function makeBill(overrides: Partial<FattureCloudBill> = {}): FattureCloudBill {
  return {
    id: 10, number: 'BILL-001', entity: { id: 5 },
    date: '2024-03-01', due_date: '2024-04-01',
    currency: { id: 'EUR' },
    totals: { amount: 1220, vat_amount: 220, amount_due: 1220 },
    status: { id: 'not_paid' },
    ...overrides,
  }
}

describe('transformBill (fatturecloud)', () => {
  it('maps id and billNumber', () => {
    const r = transformBill(makeBill())
    expect(r.id).toBe('10')
    expect(r.billNumber).toBe('BILL-001')
  })
  it('draft → DRAFT', () => { expect(transformBill(makeBill({ status: { id: 'draft' } })).status).toBe('DRAFT') })
  it('not_paid → AUTHORIZED', () => { expect(transformBill(makeBill({ status: { id: 'not_paid' } })).status).toBe('AUTHORIZED') })
  it('paid → PAID', () => { expect(transformBill(makeBill({ status: { id: 'paid' } })).status).toBe('PAID') })
  it('maps totalAmount and taxAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1220)
    expect(transformBill(makeBill()).taxAmount).toBe(220)
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
