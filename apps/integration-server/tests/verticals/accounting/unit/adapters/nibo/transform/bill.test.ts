import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type NiboBill } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/bill'

function makeRaw(overrides: Partial<NiboBill> = {}): NiboBill {
  return {
    billId: 1,
    documentNumber: 'NF-001',
    supplierId: 10,
    issueDate: '2024-01-10',
    dueDate: '2024-02-10',
    totalValue: 1000,
    taxValue: 160,
    balance: 1000,
    currencyCode: 'BRL',
    status: 'Pending',
    isCancelled: false,
    ...overrides,
  }
}

describe('nibo transformBill', () => {
  it('maps billId to id as string', () => {
    expect(transformBill(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })
  it('maps isCancelled true -> VOIDED', () => {
    expect(transformBill(makeRaw({ isCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Paid status -> PAID', () => {
    expect(transformBill(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })
  it('maps balance=0 -> PAID', () => {
    expect(transformBill(makeRaw({ balance: 0 })).status).toBe('PAID')
  })
  it('maps issueDate to postedAt as Date', () => {
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
