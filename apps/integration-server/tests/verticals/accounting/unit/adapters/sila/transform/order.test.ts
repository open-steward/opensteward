import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SilaStubOrder } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/order'

function makeRaw(overrides: Partial<SilaStubOrder> = {}): SilaStubOrder {
  return { ...overrides }
}

describe('sila transformOrder', () => {
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
