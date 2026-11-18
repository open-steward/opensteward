import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type SevDeskOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/order'

function makeOrder(overrides: Partial<SevDeskOrder> = {}): SevDeskOrder {
  return {
    id: 'ord-1',
    orderNumber: 'ORD-2024-001',
    contact: { id: 'con-1' },
    orderDate: '2024-07-01',
    currency: 'EUR',
    sumNet: '2000.00',
    sumGross: '2380.00',
    sumTax: '380.00',
    status: '100',
    orderType: 'AN',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-1')
  })

  it('maps contact id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('con-1')
  })

  it('maps currency correctly', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(2380)
  })

  it('parses orderDate as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps status 100 to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: '100' })).status).toBe('ACTIVE')
  })

  it('maps status 200 to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: '200' })).status).toBe('ACTIVE')
  })

  it('maps status 1000 to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: '1000' })).status).toBe('CANCELLED')
  })

  it('handles null contact', () => {
    expect(transformOrder(makeOrder({ contact: null })).contactId).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
