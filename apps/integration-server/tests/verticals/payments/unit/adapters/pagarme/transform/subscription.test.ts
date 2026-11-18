import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPagarmeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('pagarme transformSubscription', () => {
  it('maps core subscription fields to canonical subscription', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_abc',
      code: 'SUB-001',
      status: 'active',
      currency: 'brl',
      interval: 'month',
      interval_count: 1,
      customer: { id: 'cus_xyz' },
      current_cycle: {
        start_at: '2024-03-01T00:00:00Z',
        end_at: '2024-03-31T00:00:00Z',
      },
      items: [{ id: 'si_1', quantity: 1, pricing_scheme: { price: 9900 } }],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_abc')
    expect(result.externalId).toBe('SUB-001')
    expect(result.customerId).toBe('cus_xyz')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('BRL')
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.currentPeriodEnd).toBe('2024-03-31T00:00:00.000Z')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('si_1')
    expect(result.items[0].amount).toBe(9900)
    expect(result.items[0].quantity).toBe(1)
    expect(result.gateway).toBe('pagarme')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to cancelled', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_can',
      status: 'canceled',
      customer: { id: 'cus_can' },
      canceled_at: '2024-03-15T00:00:00Z',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-15T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps inactive status to expired', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_exp',
      status: 'inactive',
      customer: { id: 'cus_exp' },
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps future status to incomplete', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_fut',
      status: 'future',
      customer: { id: 'cus_fut' },
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps prepaid billing_type to charge_automatically', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_pre',
      status: 'active',
      customer: { id: 'cus_pre' },
      billing_type: 'prepaid',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.collectionMethod).toBe('charge_automatically')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('links default payment method from card', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_card',
      status: 'active',
      customer: { id: 'cus_card' },
      card: { id: 'card_abc' },
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.defaultPaymentMethodId).toBe('card_abc')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('puts code and billing_type into metadata', () => {
    const raw: RawPagarmeSubscription = {
      id: 'sub_meta',
      code: 'META-001',
      status: 'active',
      customer: { id: 'cus_meta' },
      billing_type: 'postpaid',
      interval: 'week',
      interval_count: 2,
      payment_method: 'credit_card',
      statement_descriptor: 'MYCO',
      items: [],
    }
    const result = transformSubscription(raw)
    expect(result.metadata['code']).toBe('META-001')
    expect(result.metadata['billing_type']).toBe('postpaid')
    expect(result.metadata['interval']).toBe('week')
    expect(result.metadata['interval_count']).toBe('2')
    expect(result.metadata['payment_method']).toBe('credit_card')
    expect(result.metadata['statement_descriptor']).toBe('MYCO')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
