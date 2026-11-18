import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ReckonSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/order'

function makeRaw(overrides: Partial<ReckonSalesOrder> = {}): ReckonSalesOrder {
  return {
    id: 'so-001',
    orderNumber: 'SO-0001',
    date: '2024-04-01',
    dueDate: '2024-04-15',
    totalAmount: 2200,
    totalTax: 200,
    contactId: 'contact-001',
    contactName: 'Buyer Co',
    status: 'OPEN',
    lineItems: [],
    ...overrides,
  }
}

describe('transformOrder (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('so-001')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('contact-001')
    expect(result.totalAmount).toBe(2200)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status', () => {
    expect(transformOrder(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps OPEN to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps FULFILLED to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'FULFILLED' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED status', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Widget',
          quantity: 2,
          unitAmount: 1000,
          amount: 2000,
          taxAmount: 200,
          accountId: 'acc-400',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(2000)
    expect(result.lineItems![0].accountId).toBe('acc-400')
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
