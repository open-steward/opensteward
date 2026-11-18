import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type TripletexSalesOrder,
  type TripletexSalesOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/salesorder'

function makeSalesOrderLine(overrides: Partial<TripletexSalesOrderLine> = {}): TripletexSalesOrderLine {
  return {
    id: 1,
    description: 'Premium Widget',
    count: 5,
    unitPriceExcludingVat: 200,
    amountExcludingVat: 1000,
    product: { id: 7, name: 'Premium Widget' },
    ...overrides,
  }
}

function makeSalesOrder(overrides: Partial<TripletexSalesOrder> = {}): TripletexSalesOrder {
  return {
    id: 707,
    orderDate: '2024-09-01',
    customer: { id: 44, name: 'Bergen Buyer AS' },
    amount: 12500,
    amountExcludingVat: 10000,
    currency: { id: '1', code: 'NOK' },
    isPrioritizeAmountsIncludingVat: false,
    isClosed: false,
    isCompleted: false,
    orderLines: [makeSalesOrderLine()],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('707')
  })

  it('maps customer id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('44')
  })

  it('maps currency code correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(12500)
  })

  it('parses orderDate as postedAt Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps isClosed false and isCompleted false to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ isClosed: false, isCompleted: false })).status).toBe('ACTIVE')
  })

  it('maps isClosed true to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ isClosed: true, isCompleted: false })).status).toBe('COMPLETED')
  })

  it('maps isCompleted true to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ isClosed: false, isCompleted: true })).status).toBe('COMPLETED')
  })

  it('maps orderLines to lineItems', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemDescription).toBe('Premium Widget')
    expect(result.lineItems?.[0].unitQuantity).toBe(5)
    expect(result.lineItems?.[0].totalAmount).toBe(1000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
