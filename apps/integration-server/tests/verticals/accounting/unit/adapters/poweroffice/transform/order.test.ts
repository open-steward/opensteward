import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type PowerOfficeOrder,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/order'

function makeOrder(overrides: Partial<PowerOfficeOrder> = {}): PowerOfficeOrder {
  return {
    id: 300,
    customerId: 15,
    orderDate: '2024-07-01',
    currencyCode: 'NOK',
    grossAmount: 2500,
    status: 1,
    orderNo: 'ORD-2024-001',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('300')
  })

  it('maps customerId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('15')
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(2500)
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('parses orderDate as Date object for postedAt', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 9 to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 9 })).status).toBe('CANCELLED')
  })

  it('maps other status values to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 1 })).status).toBe('ACTIVE')
    expect(transformOrder(makeOrder({ status: 0 })).status).toBe('ACTIVE')
    expect(transformOrder(makeOrder({ status: 3 })).status).toBe('ACTIVE')
  })

  it('sets contactId to undefined when customerId is falsy', () => {
    expect(transformOrder(makeOrder({ customerId: 0 })).contactId).toBeUndefined()
  })

  it('sets postedAt to undefined when orderDate is empty', () => {
    expect(transformOrder(makeOrder({ orderDate: '' })).postedAt).toBeUndefined()
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
