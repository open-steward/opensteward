import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MoneybirdBill } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/bill'

function makeBill(overrides: Partial<MoneybirdBill> = {}): MoneybirdBill {
  return { id: 400, reference: 'INK-001', contact_id: 200, total_price_incl_tax: '1210', tax_amount: '210', total_unpaid: '1210', currency: 'EUR', state: 'open', date: '2024-03-01', ...overrides }
}

describe('transformBill (moneybird)', () => {
  it('maps id and billNumber', () => {
    const r = transformBill(makeBill())
    expect(r.id).toBe('400')
    expect(r.billNumber).toBe('INK-001')
  })
  it('new → DRAFT', () => { expect(transformBill(makeBill({ state: 'new' })).status).toBe('DRAFT') })
  it('open → AUTHORIZED', () => { expect(transformBill(makeBill({ state: 'open' })).status).toBe('AUTHORIZED') })
  it('late → OVERDUE', () => { expect(transformBill(makeBill({ state: 'late' })).status).toBe('OVERDUE') })
  it('paid → PAID', () => { expect(transformBill(makeBill({ state: 'paid' })).status).toBe('PAID') })
  it('voided → VOIDED', () => { expect(transformBill(makeBill({ state: 'voided' })).status).toBe('VOIDED') })
  it('maps amounts', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1210)
    expect(transformBill(makeBill()).taxAmount).toBe(210)
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
