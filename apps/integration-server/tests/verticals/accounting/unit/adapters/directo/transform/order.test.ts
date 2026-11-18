import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type DirectoOrder,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<DirectoOrder> = {}): DirectoOrder {
  return {
    number: '5001',
    date: '2024-05-01',
    customercode: 'CUST01',
    currency: 'EUR',
    sum: 200,
    status: '',
    rows: [],
    ...overrides,
  }
}

describe('directo transformOrder', () => {
  it('maps number to id as string', () => {
    const result = transformOrder(makeRaw({ number: 42 }))
    expect(result.id).toBe('42')
  })

  it('type is always SALES', () => {
    const result = transformOrder(makeRaw())
    expect(result.type).toBe('SALES')
  })

  it('maps customercode to contactId', () => {
    const result = transformOrder(makeRaw({ customercode: 'C77' }))
    expect(result.contactId).toBe('C77')
  })

  it('status: invoiced → COMPLETED', () => {
    const result = transformOrder(makeRaw({ status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('status: completed → COMPLETED', () => {
    const result = transformOrder(makeRaw({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('status: cancelled → CANCELLED', () => {
    const result = transformOrder(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('status: default → ACTIVE', () => {
    const result = transformOrder(makeRaw({ status: '' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps sum to totalAmount', () => {
    const result = transformOrder(makeRaw({ sum: 999 }))
    expect(result.totalAmount).toBe(999)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformOrder(makeRaw({ date: '2024-06-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
