import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type NiboSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/salesorder'

function makeRaw(overrides: Partial<NiboSalesOrder> = {}): NiboSalesOrder {
  return {
    salesOrderId: 1,
    orderNumber: 'OV-001',
    customerId: 5,
    currencyCode: 'BRL',
    orderDate: '2024-07-01',
    status: 'Active',
    totalValue: 1500,
    taxValue: 240,
    items: [],
    ...overrides,
  }
}

describe('nibo transformSalesOrder', () => {
  it('maps salesOrderId to id as string', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })
  it('maps status Completed -> COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'Completed' })).status).toBe('COMPLETED')
  })
  it('maps status Cancelled -> CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })
  it('maps orderDate to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
