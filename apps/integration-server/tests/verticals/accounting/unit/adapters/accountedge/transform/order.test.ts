import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AccountEdgeOrder } from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/order'

function makeOrder(overrides: Partial<AccountEdgeOrder> = {}): AccountEdgeOrder {
  return {
    id: 'order-1',
    order_number: 'ORD-001',
    contact_id: 'contact-1',
    currency: 'AUD',
    total: 5000,
    tax_amount: 500,
    line_items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformOrder (accountedge)', () => {
  it('maps id and core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-1')
    expect(result.contactId).toBe('contact-1')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(5000)
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status "active" to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status "completed" to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "invoiced" to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "void" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps line items correctly', () => {
    const raw = makeOrder({
      line_items: [
        {
          id: 'li-1',
          description: 'Service',
          quantity: 2,
          unit_price: 500,
          amount: 1000,
          tax_amount: 100,
          account_id: '4000',
          discount: 0,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemDescription).toBe('Service')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('4000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
