import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AccounteerOrder } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/order'

function makeRaw(overrides: Partial<AccounteerOrder> = {}): AccounteerOrder {
  return { id: '1', ...overrides }
}

describe('accounteer transformOrder', () => {
  it('maps id', () => {
    expect(transformOrder(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
  it('maps status active -> ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'active' })).status).toBe('ACTIVE')
  })
  it('maps status completed -> COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })
  it('maps status cancelled -> CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })
  it('maps date to postedAt as Date', () => {
    const result = transformOrder(makeRaw({ date: '2024-06-01' }))
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
