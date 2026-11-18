import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SunriseSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/sunrise/transform/salesorder'

function makeSalesOrder(overrides: Partial<SunriseSalesOrder> = {}): SunriseSalesOrder {
  return {
    id: 'sunrise-so-1',
    order_number: 'SO-001',
    contact_id: 'customer-14',
    currency: 'CHF',
    total_amount: 2200,
    tax_amount: 154,
    date: '2024-01-15',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (sunrise)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('sunrise-so-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('customer-14')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2200)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('CHF')
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
    expect(transformSalesOrder(makeSalesOrder({ status: 'new' })).status).toBe('ACTIVE')
  })

  it('maps line_items to lineItems', () => {
    const raw = makeSalesOrder({
      line_items: [
        {
          id: 'li-so-1',
          name: 'Consulting',
          description: 'Tech consulting',
          quantity: 1,
          unit_price: 1000,
          amount: 1000,
          tax_amount: 70,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-so-1')
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(70)
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
