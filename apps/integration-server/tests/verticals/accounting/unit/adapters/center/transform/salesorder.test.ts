import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type CenterSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/salesorder'

function makeSalesOrder(overrides: Partial<CenterSalesOrder> = {}): CenterSalesOrder {
  return {
    id: 'ctr-so-1',
    orderNumber: 'SO-001',
    contactId: 'customer-30',
    currency: 'USD',
    subtotal: 5000,
    taxAmount: 500,
    total: 5500,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('ctr-so-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('customer-30')
  })

  it('maps currency to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(5500)
  })

  it('parses date as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps fulfilled status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'fulfilled' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 'item-3',
          name: 'Service',
          description: 'A service item',
          quantity: 2,
          unitPrice: 500,
          total: 1000,
          taxAmount: 100,
          accountId: 'acc-7',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-3')
    expect(li.itemName).toBe('Service')
    expect(li.itemDescription).toBe('A service item')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('acc-7')
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
