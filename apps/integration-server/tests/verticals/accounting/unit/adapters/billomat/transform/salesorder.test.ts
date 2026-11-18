import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type BillomatSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/salesorder'

function makeSalesOrder(overrides: Partial<BillomatSalesOrder> = {}): BillomatSalesOrder {
  return {
    id: 'bm-so-1',
    order_number: 'SO-001',
    client_id: 'client-30',
    currency_code: 'EUR',
    date: '2024-01-15',
    status: 'OPEN',
    total_gross: 7000,
    total_net: 5900,
    tax_amount: 1100,
    order_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('bm-so-1')
  })

  it('maps client_id to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('client-30')
  })

  it('maps currency_code to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(7000)
  })

  it('parses date as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps OPEN status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'OPEN' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps COMPLETED status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'COMPLETED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps INVOICED status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'INVOICED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps CANCELED status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps order_items to lineItems', () => {
    const raw = makeSalesOrder({
      order_items: [
        {
          id: 'li-3',
          article_id: 'art-7',
          description: 'Product X',
          quantity: 3,
          unit_price: 150,
          total_gross: 450,
          tax_rate: 19,
          tax_amount: 85,
          account_id: 'acc-3',
          discount: 15,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-3')
    expect(li.itemId).toBe('art-7')
    expect(li.itemDescription).toBe('Product X')
    expect(li.unitAmount).toBe(150)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(450)
    expect(li.taxAmount).toBe(85)
    expect(li.accountId).toBe('acc-3')
    expect(li.discountAmount).toBe(15)
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
