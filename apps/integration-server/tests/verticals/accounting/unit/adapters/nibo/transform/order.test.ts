import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type NiboOrder } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/order'

function makeRaw(overrides: Partial<NiboOrder> = {}): NiboOrder {
  return {
    orderId: 1,
    orderNumber: 'PED-001',
    customerId: 5,
    currencyCode: 'BRL',
    orderDate: '2024-05-01',
    status: 'Active',
    totalValue: 1000,
    taxValue: 160,
    items: [],
    ...overrides,
  }
}

describe('nibo transformOrder', () => {
  it('maps orderId to id as string', () => {
    expect(transformOrder(makeRaw()).id).toBe('1')
  })
  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
  it('maps status Completed -> COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'Completed' })).status).toBe('COMPLETED')
  })
  it('maps status Cancelled -> CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })
  it('maps orderDate to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
