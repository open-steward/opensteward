import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type Unit4Order } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/order'

function makeOrder(overrides: Partial<Unit4Order> = {}): Unit4Order {
  return {
    orderId: 'ord_001',
    orderNumber: 'ORD-2024-001',
    status: 'Draft',
    customerId: 'cust_20',
    amount: 4000,
    currencyCode: 'EUR',
    orderDate: '2024-03-01',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (Unit4)', () => {
  it('maps orderId to string id', () => {
    expect(transformOrder(makeOrder({ orderId: 'ord_001' })).id).toBe('ord_001')
  })

  it('maps numeric orderId to string', () => {
    expect(transformOrder(makeOrder({ orderId: 8 })).id).toBe('8')
  })

  it('maps amount to totalAmount', () => {
    expect(transformOrder(makeOrder({ amount: 6000 })).totalAmount).toBe(6000)
  })

  it('maps customerId to contactId', () => {
    expect(transformOrder(makeOrder({ customerId: 'cust_77' })).contactId).toBe('cust_77')
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrder(makeOrder({ currencyCode: 'GBP' })).currency).toBe('GBP')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('parses orderDate as Date', () => {
    expect(transformOrder(makeOrder({ orderDate: '2024-03-01' })).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder({ orderId: 'ord_001' }))
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
