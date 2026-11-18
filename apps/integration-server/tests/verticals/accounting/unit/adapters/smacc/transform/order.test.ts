import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SmaccOrder } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/order'

function makeRaw(overrides: Partial<SmaccOrder> = {}): SmaccOrder {
  return {
    id: 'ord-1',
    ...overrides,
  }
}

describe('smacc transformOrder', () => {
  it('maps id to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ord-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
