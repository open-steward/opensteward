import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type EgestorSalesOrderStub,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

describe('egestor transformSalesOrder (stub)', () => {
  it('returns metadata equal to raw input', () => {
    const raw: EgestorSalesOrderStub = { y: 2 }
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object with only metadata key', () => {
    const result = transformSalesOrder({})
    expect(Object.keys(result)).toEqual(['metadata'])
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    const result = transformSalesOrder({})
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
