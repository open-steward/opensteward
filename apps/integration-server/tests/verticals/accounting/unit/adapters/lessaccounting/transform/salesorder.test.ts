import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type LessAccountingSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/lessaccounting/transform/salesorder'

function makeSalesOrder(overrides: Partial<LessAccountingSalesOrder> = {}): LessAccountingSalesOrder {
  return {
    id: 'la-so-1',
    order_number: 'SO-001',
    contact_id: 'contact-15',
    currency: 'USD',
    subtotal: 1600,
    tax_amount: 400,
    total_amount: 2000,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformSalesOrder (lessaccounting)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('la-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('contact-15')
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
          name: 'Service B',
          description: 'Consulting B',
          quantity: 2,
          unit_price: 300,
          total: 600,
          tax: 60,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-so-1')
    expect(li.totalAmount).toBe(600)
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
