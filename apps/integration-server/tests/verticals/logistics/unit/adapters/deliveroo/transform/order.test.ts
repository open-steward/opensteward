import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type DeliverooOrderApiRaw,
} from '../../../../../../../src/verticals/logistics/adapters/deliveroo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<DeliverooOrderApiRaw> = {}): DeliverooOrderApiRaw {
  return {
    order_id: 'ord-123',
    restaurant_id: 'rest-456',
    customer_id: 'cust-789',
    status: 'accepted',
    prepare_for: '2024-03-01T12:00:00Z',
    partner_fee_fractional: 199,
    currency: 'GBP',
    created_at: '2024-03-01T11:00:00Z',
    updated_at: '2024-03-01T11:30:00Z',
    customer: { full_name: 'John Smith', email: 'john@example.com' },
    address: {
      address1: '10 Downing Street',
      city: 'London',
      postcode: 'SW1A 2AA',
      country_code: 'GB',
    },
    ...overrides,
  }
}

describe('deliveroo transformOrder', () => {
  it('maps order_id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-123')
  })

  it('falls back to id field when order_id absent', () => {
    const result = transformOrder(makeOrder({ order_id: null, id: 'fallback-id' }))
    expect(result.id).toBe('fallback-id')
  })

  it('maps accepted status to PROCESSING', () => {
    const result = transformOrder(makeOrder())
    expect(result.status).toBe('PROCESSING')
  })

  it('maps placed status to PENDING', () => {
    const result = transformOrder(makeOrder({ status: 'placed' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'canceled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps delivered status to DELIVERED', () => {
    const result = transformOrder(makeOrder({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps restaurant_id to warehouseId', () => {
    const result = transformOrder(makeOrder())
    expect(result.warehouseId).toBe('rest-456')
  })

  it('maps customer_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cust-789')
  })

  it('maps partner_fee_fractional to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(199)
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('GBP')
  })

  it('maps prepare_for to orderAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.orderAt?.toISOString()).toBe('2024-03-01T12:00:00.000Z')
  })

  it('maps createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes schema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles missing address and customer gracefully', () => {
    const result = transformOrder(makeOrder({ address: null, customer: null }))
    expect(result.destinationAddress).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
