import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type HoldedSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/holded/transform/salesorder'

function makeSalesOrder(overrides: Partial<HoldedSalesOrder> = {}): HoldedSalesOrder {
  return {
    id: 'holded-so-1',
    orderNum: '2024SO001',
    contact: 'customer-8',
    currency: 'EUR',
    subtotal: 1200,
    tax: 300,
    total: 1500,
    items: [],
    date: 1705276800,
    status: 1,
    ...overrides,
  }
}

describe('transformSalesOrder (holded)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('holded-so-1')
  })

  it('maps contact to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-8')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1500)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('converts unix timestamp to Date for postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date(1705276800 * 1000))
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 'item-so-1',
          name: 'Product X',
          description: 'Desc X',
          units: 2,
          subtotal: 300,
          total: 360,
          tax: 60,
          accountId: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-so-1')
    expect(li.itemName).toBe('Product X')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(360)
    expect(li.taxAmount).toBe(60)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
