import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type PandleSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/salesorder'

function makeSalesOrder(overrides: Partial<PandleSalesOrder> = {}): PandleSalesOrder {
  return {
    id: 301,
    order_number: 'SO-301',
    customer_id: 88,
    currency: 'GBP',
    issue_date: '2024-01-15',
    status: 'active',
    net_amount: 1000,
    tax_amount: 200,
    total_amount: 1200,
    reference: 'SREF-001',
    notes: 'Test note',
    order_lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (pandle)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('301')
  })

  it('maps customer_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('88')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1200)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('GBP')
  })

  it('maps issue_date to postedAt as Date', () => {
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

  it('maps order_lines to lineItems', () => {
    const raw = makeSalesOrder({
      order_lines: [
        {
          id: 401,
          account_id: 3000,
          description: 'Consulting',
          quantity: 1,
          unit_price: 500,
          net_amount: 500,
          tax_rate_id: 1,
          tax_amount: 100,
          total_amount: 600,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('401')
    expect(li.totalAmount).toBe(600)
    expect(li.taxAmount).toBe(100)
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
