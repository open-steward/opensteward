import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawAirwallexSubscription,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('airwallex transformSubscription', () => {
  it('maps status "ACTIVE" to "active" with collection method "AUTO_CHARGE"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-001',
      billing_customer_id: 'cus-001',
      status: 'ACTIVE',
      currency: 'usd',
      collection_method: 'AUTO_CHARGE',
      default_payment_method_id: 'pm-001',
      latest_invoice_id: 'inv-001',
      starts_at: '2024-03-01T00:00:00+0000',
      ends_at: '2024-04-01T00:00:00+0000',
      items: [
        {
          id: 'si-001',
          price_id: 'price-001',
          product_id: 'prod-001',
          quantity: 1,
          unit_amount: 9.99,
        },
      ],
      created_at: '2024-03-01T00:00:00+0000',
      updated_at: '2024-03-01T00:00:00+0000',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('cus-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.collectionMethod).toBe('charge_automatically')
    expect(result.gateway).toBe('airwallex')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('si-001')
    expect(result.items[0].amount).toBe(999)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "IN_TRIAL" to "trialing"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-002',
      billing_customer_id: 'cus-002',
      status: 'IN_TRIAL',
      trial_ends_at: '2024-03-15T00:00:00+0000',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(result.trialEnd).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "PAST_DUE" to "past_due"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-003',
      billing_customer_id: 'cus-003',
      status: 'PAST_DUE',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "CANCELLED" to "cancelled"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-004',
      billing_customer_id: 'cus-004',
      status: 'CANCELLED',
      cancelled_at: '2024-03-10T00:00:00+0000',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "EXPIRED" to "expired"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-005',
      billing_customer_id: 'cus-005',
      status: 'EXPIRED',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "PAUSED" to "paused"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-006',
      billing_customer_id: 'cus-006',
      status: 'PAUSED',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "PENDING" to "incomplete"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-007',
      billing_customer_id: 'cus-007',
      status: 'PENDING',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps collection_method "OUT_OF_BAND" to "send_invoice"', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-008',
      billing_customer_id: 'cus-008',
      status: 'ACTIVE',
      collection_method: 'OUT_OF_BAND',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.collectionMethod).toBe('send_invoice')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets currentPeriodStart/End and billingAnchor from starts_at/ends_at', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-009',
      billing_customer_id: 'cus-009',
      status: 'ACTIVE',
      starts_at: '2024-03-01T00:00:00+0000',
      ends_at: '2024-04-01T00:00:00+0000',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodStart).toBeDefined()
    expect(result.currentPeriodEnd).toBeDefined()
    expect(result.billingAnchor).toBe(result.currentPeriodStart)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('falls back item id to price_id when item.id is absent', () => {
    const raw: RawAirwallexSubscription = {
      id: 'sub-010',
      billing_customer_id: 'cus-010',
      status: 'ACTIVE',
      items: [{ price_id: 'price-010', quantity: 2 }],
    }
    const result = transformSubscription(raw)
    expect(result.items[0].id).toBe('price-010')
    expect(result.items[0].quantity).toBe(2)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
