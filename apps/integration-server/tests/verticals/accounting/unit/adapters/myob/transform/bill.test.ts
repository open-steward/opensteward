import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MyobBill } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/bill'

function makeBill(overrides: Partial<MyobBill> = {}): MyobBill {
  return { UID: 'uid-4', Number: 'PO-001', Supplier: { UID: 'sup-1' }, Date: '2024-03-01', TotalAmount: 1100, TotalTax: 100, Status: 'Open', ...overrides }
}

describe('transformBill (myob)', () => {
  it('maps id and billNumber', () => {
    expect(transformBill(makeBill()).id).toBe('uid-4')
    expect(transformBill(makeBill()).billNumber).toBe('PO-001')
  })
  it('Open → AUTHORIZED', () => { expect(transformBill(makeBill({ Status: 'Open' })).status).toBe('AUTHORIZED') })
  it('Closed → PAID', () => { expect(transformBill(makeBill({ Status: 'Closed' })).status).toBe('PAID') })
  it('Voided → VOIDED', () => { expect(transformBill(makeBill({ Status: 'Voided' })).status).toBe('VOIDED') })
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
