import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type KoraStubOrder } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/order'

function makeRaw(overrides: KoraStubOrder = {}): KoraStubOrder {
  return { ...overrides }
}

describe('kora transformOrder', () => {
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
