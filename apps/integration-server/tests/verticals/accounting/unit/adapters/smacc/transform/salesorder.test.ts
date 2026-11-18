import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SmaccSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/salesorder'

function makeRaw(overrides: Partial<SmaccSalesOrder> = {}): SmaccSalesOrder {
  return {
    id: 'so-1',
    ...overrides,
  }
}

describe('smacc transformSalesOrder', () => {
  it('maps id to id', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('so-1')
  })

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
