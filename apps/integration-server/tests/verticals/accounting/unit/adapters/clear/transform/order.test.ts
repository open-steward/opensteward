import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type ClearOrder,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/order'

function makeRaw(overrides: Partial<ClearOrder> = {}): ClearOrder {
  return {
    id: 'order-uuid-001',
    ...overrides,
  }
}

describe('transformOrder (clear)', () => {
  it('maps id correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('order-uuid-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
