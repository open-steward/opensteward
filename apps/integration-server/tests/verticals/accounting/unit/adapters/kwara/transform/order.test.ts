import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type KwaraOrder } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/order'

function makeRaw(overrides: Partial<KwaraOrder> = {}): KwaraOrder {
  return { id: 'ord-001', ...overrides }
}

describe('transformOrder (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformOrder(makeRaw())
    expect(r.id).toBe('ord-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
