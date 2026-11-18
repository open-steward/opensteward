import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawMollieSubscription,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('mollie transformSubscription', () => {
  it('maps an active subscription with decimal amount to minor units', () => {
    const raw: RawMollieSubscription = {
      id: 'sub_1',
      customerId: 'cst_abc',
      status: 'active',
      amount: { value: '9.99', currency: 'EUR' },
      times: 12,
      interval: '1 month',
      description: 'Monthly Pro',
      method: 'creditcard',
      mandateId: 'mdt_1',
      nextPaymentDate: '2023-12-01T00:00:00+00:00',
      startDate: '2023-11-01T00:00:00+00:00',
      createdAt: '2023-11-01T00:00:00+00:00',
      metadata: { plan: 'pro' },
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_1')
    expect(result.customerId).toBe('cst_abc')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('EUR')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(999)
    expect(result.defaultPaymentMethodId).toBe('mdt_1')
    expect(result.gateway).toBe('mollie')
    expect(result.metadata.plan).toBe('pro')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to cancelled', () => {
    const raw: RawMollieSubscription = {
      id: 'sub_2',
      customerId: 'cst_def',
      status: 'canceled',
      amount: { value: '5.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
      canceledAt: '2023-11-10T00:00:00+00:00',
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2023-11-10T00:00:00+00:00')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps suspended status to paused', () => {
    const raw: RawMollieSubscription = {
      id: 'sub_3',
      customerId: 'cst_ghi',
      status: 'suspended',
      amount: { value: '15.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
