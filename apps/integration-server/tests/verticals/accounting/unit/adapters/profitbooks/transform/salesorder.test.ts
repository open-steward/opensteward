import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ProfitBooksSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/salesorder'

function makeSalesOrder(overrides: Partial<ProfitBooksSalesOrder> = {}): ProfitBooksSalesOrder {
  return {
    id: 'pb-so-1',
    order_number: 'SO-001',
    contact_id: 'customer-6',
    currency: 'INR',
    total_amount: 10000,
    tax_amount: 1800,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformSalesOrder (profitbooks)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('pb-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-6')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(10000)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('INR')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status fulfilled to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'fulfilled' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'new' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 'item-so-1',
          name: 'Product X',
          description: 'Desc X',
          quantity: 2,
          rate: 500,
          amount: 1000,
          tax_amount: 180,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-so-1')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(180)
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
