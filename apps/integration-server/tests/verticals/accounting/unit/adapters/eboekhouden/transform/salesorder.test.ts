import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type EBoekhoudenSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/salesorder'

function makeSalesOrder(overrides: Partial<EBoekhoudenSalesOrder> = {}): EBoekhoudenSalesOrder {
  return {
    id: 600,
    orderNumber: 'SO-001',
    relationId: 42,
    totalInclTax: 3000,
    status: 'active',
    date: '2024-06-01',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformSalesOrder (eboekhouden)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('600')
  })

  it('active → ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder()).status).toBe('ACTIVE')
  })

  it('completed → COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(3000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
