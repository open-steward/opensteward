import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type NetSuiteBill } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/bill'

function makeBill(overrides: Partial<NetSuiteBill> = {}): NetSuiteBill {
  return { id: 300, tranId: 'BILL-001', entity: 50, total: 1100, taxTotal: 100, currency: 'USD', status: 'Open', tranDate: '2024-03-01', ...overrides }
}

describe('transformBill (netsuite)', () => {
  it('maps id and billNumber', () => {
    expect(transformBill(makeBill()).id).toBe('300')
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })
  it('Open → AUTHORIZED', () => { expect(transformBill(makeBill({ status: 'Open' })).status).toBe('AUTHORIZED') })
  it('Paid In Full → PAID', () => { expect(transformBill(makeBill({ status: 'Paid In Full' })).status).toBe('PAID') })
  it('Cancelled → VOIDED', () => { expect(transformBill(makeBill({ status: 'Cancelled' })).status).toBe('VOIDED') })
  it('maps amounts', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1100)
    expect(transformBill(makeBill()).taxAmount).toBe(100)
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
