import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type EBoekhoudenBill } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/bill'

function makeBill(overrides: Partial<EBoekhoudenBill> = {}): EBoekhoudenBill {
  return {
    id: 55,
    invoiceNumber: 'INK-2024-001',
    relationId: 42,
    totalInclTax: 1210,
    taxAmount: 210,
    isPaid: false,
    isCancelled: false,
    date: '2024-02-01',
    dueDate: '2024-03-01',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformBill (eboekhouden)', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('55')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('INK-2024-001')
  })

  it('maps contactId from relationId', () => {
    expect(transformBill(makeBill()).contactId).toBe('42')
  })

  it('not paid → AUTHORIZED', () => {
    expect(transformBill(makeBill({ isPaid: false })).status).toBe('AUTHORIZED')
  })

  it('isPaid → PAID', () => {
    expect(transformBill(makeBill({ isPaid: true })).status).toBe('PAID')
  })

  it('isCancelled → VOIDED', () => {
    expect(transformBill(makeBill({ isCancelled: true })).status).toBe('VOIDED')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(1210)
    expect(result.taxAmount).toBe(210)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
