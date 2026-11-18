import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type NetSuiteSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/salesorder'

function makeSO(overrides: Partial<NetSuiteSalesOrder> = {}): NetSuiteSalesOrder {
  return { id: 1000, entity: 100, total: 1500, currency: 'USD', status: 'Pending Fulfillment', ...overrides }
}

describe('transformSalesOrder (netsuite)', () => {
  it('maps id and contactId', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('1000')
    expect(transformSalesOrder(makeSO()).contactId).toBe('100')
  })
  it('Closed → COMPLETED', () => { expect(transformSalesOrder(makeSO({ status: 'Closed' })).status).toBe('COMPLETED') })
  it('maps totalAmount', () => { expect(transformSalesOrder(makeSO()).totalAmount).toBe(1500) })
  it('passes raw as metadata', () => {
    const raw = makeSO()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSO())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
