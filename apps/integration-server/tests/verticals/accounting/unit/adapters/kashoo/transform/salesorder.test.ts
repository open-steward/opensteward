import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type KashooSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/salesorder'

function makeSalesOrder(overrides: Partial<KashooSalesOrder> = {}): KashooSalesOrder {
  return {
    id: 'kash-so-1',
    order_number: 'SO-001',
    contact_id: 'contact-20',
    currency: 'CAD',
    subtotal: 800,
    tax_amount: 200,
    total: 1000,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformSalesOrder (kashoo)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('kash-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('contact-20')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1000)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('CAD')
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
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 'item-so-1',
          name: 'Service A',
          description: 'Consulting',
          quantity: 1,
          unit_price: 500,
          total: 500,
          tax_amount: 50,
          account_id: 'acc-revenue',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-so-1')
    expect(li.totalAmount).toBe(500)
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
