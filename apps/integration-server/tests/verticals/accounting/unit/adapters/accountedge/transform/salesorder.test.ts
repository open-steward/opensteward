import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AccountEdgeSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/salesorder'

function makeSalesOrder(overrides: Partial<AccountEdgeSalesOrder> = {}): AccountEdgeSalesOrder {
  return {
    id: 'so-1',
    order_number: 'SO-001',
    contact_id: 'contact-1',
    currency: 'AUD',
    total: 6000,
    tax_amount: 600,
    line_items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformSalesOrder (accountedge)', () => {
  it('maps id and core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-1')
    expect(result.contactId).toBe('contact-1')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(6000)
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "active" to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status "completed" to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "invoiced" to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "void" to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps line items correctly', () => {
    const raw = makeSalesOrder({
      line_items: [
        {
          id: 'li-1',
          description: 'Widget',
          quantity: 4,
          unit_price: 250,
          amount: 1000,
          tax_amount: 100,
          account_id: '3000',
          discount: 0,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(250)
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('3000')
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
