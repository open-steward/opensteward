import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AccounteerBill } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/bill'

function makeRaw(overrides: Partial<AccounteerBill> = {}): AccounteerBill {
  return { id: '1', ...overrides }
}

describe('accounteer transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })
  it('maps status draft -> DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })
  it('maps status paid -> PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })
  it('maps issue_date to postedAt as Date', () => {
    const result = transformBill(makeRaw({ issue_date: '2024-01-15' }))
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })
  it('maps due_date to dueAt as Date', () => {
    const result = transformBill(makeRaw({ due_date: '2024-02-15' }))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
