import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SellsySalesOrder } from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/salesorder'

function makeSalesOrder(overrides: Partial<SellsySalesOrder> = {}): SellsySalesOrder {
  return {
    id: 'sellsy-so-1',
    number: 'SO-001',
    contact_id: 'customer-11',
    currency: 'EUR',
    date: '2024-01-15',
    status: 'active',
    total_amount: 2400,
    tax_amount: 480,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (sellsy)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('sellsy-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-11')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2400)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'processing' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeSalesOrder({
      lines: [
        {
          id: 'line-so-1',
          product_id: 'prod-7',
          description: 'Service',
          quantity: 2,
          unit_amount: 300,
          total_amount: 600,
          tax_amount: 120,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-so-1')
    expect(li.itemId).toBe('prod-7')
    expect(li.unitAmount).toBe(300)
    expect(li.totalAmount).toBe(600)
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
