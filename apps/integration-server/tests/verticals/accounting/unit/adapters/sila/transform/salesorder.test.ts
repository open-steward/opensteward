import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SilaStubSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/salesorder'

function makeRaw(overrides: Partial<SilaStubSalesOrder> = {}): SilaStubSalesOrder {
  return { ...overrides }
}

describe('sila transformSalesOrder', () => {
  it('handles missing optional fields gracefully', () => {
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
