import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type CalxaOrder,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrder(overrides: Partial<CalxaOrder> = {}): CalxaOrder {
  return {
    id: 'ord-001',
    orderNumber: 'ORD-001',
    contactId: 'contact-42',
    status: 'completed',
    type: 'SALES',
    currency: 'USD',
    total: 800,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id as-is', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-001')
  })

  it('maps contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(800)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformOrder(makeOrder({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps type SALES to SALES', () => {
    expect(transformOrder(makeOrder({ type: 'SALES' })).type).toBe('SALES')
  })

  it('maps type PURCHASE to PURCHASE', () => {
    expect(transformOrder(makeOrder({ type: 'PURCHASE' })).type).toBe('PURCHASE')
  })

  it('maps lowercase purchase to PURCHASE', () => {
    expect(transformOrder(makeOrder({ type: 'purchase' })).type).toBe('PURCHASE')
  })

  it('defaults type to SALES when type is undefined', () => {
    expect(transformOrder(makeOrder({ type: undefined })).type).toBe('SALES')
  })

  it('defaults type to SALES for non-PURCHASE values', () => {
    expect(transformOrder(makeOrder({ type: 'OTHER' })).type).toBe('SALES')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status billed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'billed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status canceled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps undefined status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: undefined })).status).toBe('ACTIVE')
  })

  it('maps createdAt to Date', () => {
    const result = transformOrder(makeOrder({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformOrder(makeOrder({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
