import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type DineroOrder,
} from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/order'

function makeOrder(overrides: Partial<DineroOrder> = {}): DineroOrder {
  return {
    Guid: 'guid-ord-1',
    Number: 100,
    ContactGuid: 'contact-guid-1',
    Currency: 'DKK',
    Date: '2024-01-15',
    TotalInclVat: 12500,
    TotalVat: 2500,
    Status: 'Active',
    OrderLines: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps Guid to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('guid-ord-1')
  })

  it('maps ContactGuid to contactId', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('contact-guid-1')
  })

  it('maps Currency to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps TotalInclVat to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(12500)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses Date as Date object', () => {
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

  it('maps Invoiced status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ Status: 'Invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps OrderLines to lineItems', () => {
    const raw = makeOrder({
      OrderLines: [
        {
          Guid: 'line-guid-1',
          ProductGuid: 'prod-guid-1',
          Description: 'Premium Widget',
          Quantity: 4,
          AccountNumber: 1000,
          BaseAmountValue: 300,
          TotalAmount: 1200,
          VatAmount: 240,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-guid-1')
    expect(li.itemId).toBe('prod-guid-1')
    expect(li.itemDescription).toBe('Premium Widget')
    expect(li.unitAmount).toBe(300)
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(1200)
    expect(li.taxAmount).toBe(240)
    expect(li.accountId).toBe('1000')
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
