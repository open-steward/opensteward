import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MazumaBill } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/bill'

function makeRaw(overrides: Partial<MazumaBill> = {}): MazumaBill {
  return { id: '1', ...overrides }
}

describe('mazuma transformBill', () => {
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
  it('defaults currency to GBP', () => {
    expect(transformBill(makeRaw()).currency).toBe('GBP')
  })
  it('maps status authorized -> AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })
  it('maps bill_date to postedAt as Date', () => {
    const result = transformBill(makeRaw({ bill_date: '2024-01-15' }))
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
