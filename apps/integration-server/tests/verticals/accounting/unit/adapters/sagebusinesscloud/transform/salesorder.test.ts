import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SageSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/salesorder'

describe('transformSalesOrder (SageBusinessCloud)', () => {
  it('maps id correctly', () => {
    const raw: SageSalesOrder = { id: 'so-001' }
    const result = transformSalesOrder(raw)
    expect(result.id).toBe('so-001')
  })

  it('sets metadata to raw object', () => {
    const raw: SageSalesOrder = { id: 'so-002' }
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'so-001' }
    const result = transformSalesOrder(raw)
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
