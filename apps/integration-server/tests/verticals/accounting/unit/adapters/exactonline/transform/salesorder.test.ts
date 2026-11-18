import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ExactSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/salesorder'

function makeSO(overrides: Partial<ExactSalesOrder> = {}): ExactSalesOrder {
  return { OrderID: 'so-1', OrderedBy: 'c-1', AmountDC: 1500, Currency: 'EUR', Status: 20, OrderDate: '2024-09-01', ...overrides }
}

describe('transformSalesOrder (exactonline)', () => {
  it('maps id and contactId', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('so-1')
    expect(transformSalesOrder(makeSO()).contactId).toBe('c-1')
  })
  it('Status 12 → DRAFT', () => {
    expect(transformSalesOrder(makeSO({ Status: 12 })).status).toBe('DRAFT')
  })
  it('Status 45 → COMPLETED', () => {
    expect(transformSalesOrder(makeSO({ Status: 45 })).status).toBe('COMPLETED')
  })
  it('maps totalAmount', () => {
    expect(transformSalesOrder(makeSO()).totalAmount).toBe(1500)
  })
  it('passes raw as metadata', () => {
    const raw = makeSO()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSO())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
