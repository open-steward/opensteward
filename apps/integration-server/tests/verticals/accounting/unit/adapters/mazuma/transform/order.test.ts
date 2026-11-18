import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MazumaStubOrder } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/order'

function makeRaw(overrides: MazumaStubOrder = {}): MazumaStubOrder {
  return { ...overrides }
}

describe('mazuma transformOrder', () => {
  it('handles empty object gracefully', () => {
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
