import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type SmaccBill } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/bill'

function makeRaw(overrides: Partial<SmaccBill> = {}): SmaccBill {
  return {
    id: 'bill-1',
    number: 'B-001',
    contact_id: 'c-5',
    status: 'draft',
    currency: 'EUR',
    tax_amount: 100,
    total: 1100,
    amount_due: 1100,
    amount_paid: 0,
    date: '2024-01-10',
    due_date: '2024-02-10',
    line_items: [],
    ...overrides,
  }
}

describe('smacc transformBill', () => {
  it('maps id to id', () => {
    expect(transformBill(makeRaw()).id).toBe('bill-1')
  })

  it('maps number to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('B-001')
  })

  it('maps status=draft to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status=authorized to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps status=paid to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status=voided to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-02-10'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
