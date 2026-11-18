import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type UhasibuBill } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/bill'

function makeRaw(overrides: Partial<UhasibuBill> = {}): UhasibuBill {
  return {
    id: 'ub-1',
    bill_number: 'UB-001',
    contact_id: 'c-4',
    status: 'draft',
    currency: 'KES',
    tax_amount: 50,
    total_amount: 550,
    amount_due: 550,
    amount_paid: 0,
    issue_date: '2024-02-01',
    due_date: '2024-03-01',
    line_items: [],
    ...overrides,
  }
}

describe('uhasibu transformBill', () => {
  it('maps id to id', () => {
    expect(transformBill(makeRaw()).id).toBe('ub-1')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('UB-001')
  })

  it('maps status=draft to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status=paid to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status=overdue to OVERDUE', () => {
    expect(transformBill(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status=cancelled to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-03-01'))
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
