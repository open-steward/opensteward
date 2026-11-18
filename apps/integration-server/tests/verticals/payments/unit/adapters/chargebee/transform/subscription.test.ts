import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawChargebeeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

const baseRaw: RawChargebeeSubscription = {
  id: 'sub_001',
  customer_id: 'cust_123',
  status: 'active',
  currency_code: 'USD',
  subscription_items: [{ item_price_id: 'price_monthly', quantity: 1, unit_price: 1999 }],
  current_term_start: 1709251200, // 2024-03-01T00:00:00Z
  current_term_end: 1711929600, // 2024-04-01T00:00:00Z
  payment_source_id: 'pm_abc',
  created_at: 1709251200,
  updated_at: 1709251200,
}

describe('chargebee transformSubscription', () => {
  it('maps status "active" to "active"', () => {
    const result = transformSubscription(baseRaw)
    expect(result.status).toBe('active')
    expect(result.gateway).toBe('chargebee')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('surfaces customerId and currency', () => {
    const result = transformSubscription(baseRaw)
    expect(result.customerId).toBe('cust_123')
    expect(result.currency).toBe('USD')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "in_trial" to "trialing"', () => {
    const result = transformSubscription({ ...baseRaw, status: 'in_trial' })
    expect(result.status).toBe('trialing')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "paused" to "paused"', () => {
    const result = transformSubscription({ ...baseRaw, status: 'paused' })
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const result = transformSubscription({ ...baseRaw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps subscription_items to canonical items array', () => {
    const result = transformSubscription(baseRaw)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price_monthly')
    expect(result.items[0].amount).toBe(1999)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second currentPeriodStart to ISO string', () => {
    const result = transformSubscription(baseRaw)
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
