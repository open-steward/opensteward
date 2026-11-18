import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type AkauntingOrder,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/order'

function makeOrder(overrides: Partial<AkauntingOrder> = {}): AkauntingOrder {
  return {
    id: 42,
    document_number: 'ORD-42',
    contact_id: 7,
    contact_name: 'Acme Corp',
    currency_code: 'EUR',
    issued_at: '2024-01-15',
    status: 'active',
    amount: 1200,
    tax_total: 200,
    category_id: 1,
    items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to string id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('42')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('7')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(1200)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses issued_at as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps invoiced status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makeOrder({
      items: [
        {
          id: 10,
          item_id: 5,
          name: 'Widget',
          description: 'A widget',
          quantity: 3,
          price: 100,
          total: 300,
          tax: 30,
          tax_id: 2,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemId).toBe('5')
    expect(li.itemDescription).toBe('A widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
    expect(li.taxAmount).toBe(30)
    expect(li.taxrateId).toBe('2')
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
