import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type SoldoOrder,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<SoldoOrder> = {}): SoldoOrder {
  return {
    id: 'ord_001',
    status: 'COMPLETED',
    creation_time: '2024-04-10T09:00:00.000Z',
    last_update_time: '2024-04-10T10:00:00.000Z',
    total_paid_amount: 55.0,
    total_paid_currency: 'GBP',
    is_valid: true,
    ...overrides,
  }
}

describe('transformOrder (soldo)', () => {
  it('maps id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ord_001')
  })

  it('sets type to PURCHASE', () => {
    expect(transformOrder(makeRaw()).type).toBe('PURCHASE')
  })

  it('maps total_paid_currency to currency', () => {
    expect(transformOrder(makeRaw()).currency).toBe('GBP')
  })

  it('converts total_paid_amount to minor units (55.00 → 5500)', () => {
    expect(transformOrder(makeRaw({ total_paid_amount: 55.0 })).totalAmount).toBe(5500)
  })

  it('maps creation_time to postedAt and createdAt', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-10T09:00:00.000Z'))
    expect(result.createdAt).toEqual(new Date('2024-04-10T09:00:00.000Z'))
  })

  it('maps last_update_time to updatedAt', () => {
    expect(transformOrder(makeRaw()).updatedAt).toEqual(new Date('2024-04-10T10:00:00.000Z'))
  })

  it('maps COMPLETED to COMPLETED status', () => {
    expect(transformOrder(makeRaw({ status: 'COMPLETED' })).status).toBe('COMPLETED')
  })

  it('maps PENDING to ACTIVE status', () => {
    expect(transformOrder(makeRaw({ status: 'PENDING' })).status).toBe('ACTIVE')
  })

  it('maps PLACED to ACTIVE status', () => {
    expect(transformOrder(makeRaw({ status: 'PLACED' })).status).toBe('ACTIVE')
  })

  it('maps CANCELLED to CANCELLED status', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps ERROR to CANCELLED status', () => {
    expect(transformOrder(makeRaw({ status: 'ERROR' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to unknown', () => {
    expect(transformOrder(makeRaw({ status: 'MYSTERY' })).status).toBe('unknown')
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
