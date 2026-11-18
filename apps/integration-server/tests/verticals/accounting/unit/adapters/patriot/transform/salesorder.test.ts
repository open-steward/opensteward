import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type PatriotSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/salesorder'

function makeSalesOrder(overrides: Partial<PatriotSalesOrder> = {}): PatriotSalesOrder {
  return {
    id: 'pat-so-1',
    number: 'SO-001',
    contact_id: 'customer-30',
    currency: 'USD',
    date: '2024-01-15',
    status: 'active',
    total_amount: 2000,
    tax_amount: 400,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (patriot)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('pat-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-30')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2000)
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

  it('maps status fulfilled to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'fulfilled' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status void to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'void' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'voided' })).status).toBe('CANCELLED')
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
          description: 'Product',
          quantity: 3,
          rate: 100,
          amount: 300,
          tax_amount: 30,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-so-1')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
    expect(li.taxAmount).toBe(30)
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
