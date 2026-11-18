import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type BillyOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/order'

function makeOrder(overrides: Partial<BillyOrder> = {}): BillyOrder {
  return {
    id: 'billy-ord-1',
    orderNo: 1001,
    contactId: 'contact-5',
    currencyId: 'DKK',
    entryDate: '2024-01-15',
    state: 'active',
    grossAmount: 12000,
    taxAmount: 2000,
    orderLines: [],
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('billy-ord-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('contact-5')
  })

  it('maps currencyId to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps grossAmount to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(12000)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses entryDate as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active state to ACTIVE', () => {
    const result = transformOrder(makeOrder({ state: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft state to DRAFT', () => {
    const result = transformOrder(makeOrder({ state: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed state to COMPLETED', () => {
    const result = transformOrder(makeOrder({ state: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps invoiced state to COMPLETED', () => {
    const result = transformOrder(makeOrder({ state: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps voided state to CANCELLED', () => {
    const result = transformOrder(makeOrder({ state: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps cancelled state to CANCELLED', () => {
    const result = transformOrder(makeOrder({ state: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps orderLines to lineItems', () => {
    const raw = makeOrder({
      orderLines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          description: 'Item A',
          quantity: 5,
          unitPrice: 200,
          amount: 1000,
          taxRateId: 'tax-1',
          taxAmount: 100,
          accountId: 'acc-10',
          discount: 0,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemDescription).toBe('Item A')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.taxrateId).toBe('tax-1')
    expect(li.accountId).toBe('acc-10')
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
