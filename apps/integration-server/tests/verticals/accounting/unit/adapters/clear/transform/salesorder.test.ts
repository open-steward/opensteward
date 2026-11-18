import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type ClearSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/salesorder'

function makeRaw(overrides: Partial<ClearSalesOrder> = {}): ClearSalesOrder {
  return {
    id: 'sorder-uuid-001',
    ...overrides,
  }
}

describe('transformSalesOrder (clear)', () => {
  it('maps id correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('sorder-uuid-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
