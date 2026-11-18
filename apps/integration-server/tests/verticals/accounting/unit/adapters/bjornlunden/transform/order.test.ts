import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type BlOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/order'

function makeOrder(overrides: Partial<BlOrder> = {}): BlOrder {
  return {
    Id: 'bl-ord-1',
    OrderNumber: 500,
    CustomerId: 'cust-7',
    Currency: 'SEK',
    OrderDate: '2024-01-15',
    TotalAmount: 15000,
    VatAmount: 3000,
    Status: 'Active',
    Lines: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps Id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('bl-ord-1')
  })

  it('maps CustomerId to contactId', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('cust-7')
  })

  it('maps Currency to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('SEK')
  })

  it('maps TotalAmount to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(15000)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses OrderDate as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps Active status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ Status: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ Status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Lines to lineItems', () => {
    const raw = makeOrder({
      Lines: [
        {
          Id: 'ln-1',
          ArticleNumber: 'ART-001',
          Description: 'Component',
          Quantity: 3,
          UnitPrice: 500,
          Amount: 1500,
          VatRate: 25,
          AccountNumber: 3000,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ln-1')
    expect(li.itemId).toBe('ART-001')
    expect(li.itemDescription).toBe('Component')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(1500)
    expect(li.accountId).toBe('3000')
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
