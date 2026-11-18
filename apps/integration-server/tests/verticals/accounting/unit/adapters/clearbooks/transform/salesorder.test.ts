import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ClearBooksSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/salesorder'

function makeSalesOrder(overrides: Partial<ClearBooksSalesOrder> = {}): ClearBooksSalesOrder {
  return {
    sales_order_id: '401',
    order_number: 'SO-2024-001',
    entity_id: '42',
    date_created: '10/04/2024',
    total_gross: 840,
    total_tax: 140,
    currency: 'GBP',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('401')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(840)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps active status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps delivered status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'delivered' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'new' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items to lineItems', () => {
    const raw = makeSalesOrder({
      line_items: [
        {
          id: 11,
          description: 'Widget',
          quantity: 10,
          unit_price: 84,
          total_net: 840,
          tax_amount: 168,
          account_code: '4000',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('11')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
