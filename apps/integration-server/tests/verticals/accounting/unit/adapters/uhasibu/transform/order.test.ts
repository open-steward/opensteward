import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type UhasibuOrder } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/order'

function makeRaw(overrides: Partial<UhasibuOrder> = {}): UhasibuOrder {
  return {
    id: 'uo-1',
    ...overrides,
  }
}

describe('uhasibu transformOrder', () => {
  it('maps id to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('uo-1')
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
