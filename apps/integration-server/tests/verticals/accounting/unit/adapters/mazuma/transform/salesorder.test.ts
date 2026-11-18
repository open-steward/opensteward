import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MazumaStubSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/salesorder'

function makeRaw(overrides: MazumaStubSalesOrder = {}): MazumaStubSalesOrder {
  return { ...overrides }
}

describe('mazuma transformSalesOrder', () => {
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
