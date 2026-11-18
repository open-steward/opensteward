import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type KoraStubSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/salesorder'

function makeRaw(overrides: KoraStubSalesOrder = {}): KoraStubSalesOrder {
  return { ...overrides }
}

describe('kora transformSalesOrder', () => {
  it('handles empty object gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
