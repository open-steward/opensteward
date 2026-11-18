import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AppFolioSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/salesorder'

function makeSalesOrder(overrides: Partial<AppFolioSalesOrder> = {}): AppFolioSalesOrder {
  return {
    id: '401',
    order_number: 'SO-2024-001',
    tenant_id: '42',
    property_id: 'prop_1',
    lease_id: 'lease_1',
    date: '2024-04-10',
    amount: 3000,
    currency: 'USD',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('401')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(3000)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO date as Date object', () => {
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

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'completed' }))
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
          description: 'Security deposit',
          quantity: 1,
          unit_price: 3000,
          amount: 3000,
          account_id: '4002',
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
