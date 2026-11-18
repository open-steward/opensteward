import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type StessaSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/salesorder'

function makeSalesOrder(overrides: Partial<StessaSalesOrder> = {}): StessaSalesOrder {
  return {
    id: 'stessa-so-1',
    orderNumber: 'SO-001',
    contactId: 'customer-13',
    currency: 'USD',
    total: 3000,
    taxAmount: 600,
    date: '2024-01-15',
    status: 'active',
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (stessa)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('stessa-so-1')
  })

  it('maps contactId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-13')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(3000)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status void to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'void' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'processing' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 'item-so-1',
          name: 'Service C',
          description: 'Consulting C',
          quantity: 2,
          unitPrice: 500,
          total: 1000,
          taxAmount: 200,
          accountId: 'acc-revenue',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-so-1')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
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
