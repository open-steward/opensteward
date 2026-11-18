import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawCybersourceSubscription,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('cybersource transformSubscription', () => {
  it('maps an ACTIVE subscription with amount and customer', () => {
    const raw: RawCybersourceSubscription = {
      id: 'sub_1',
      subscriptionInformation: {
        status: 'ACTIVE',
        planId: 'plan_pro',
        name: 'Pro Plan',
        code: 'SUB-001',
      },
      paymentInformation: {
        customer: { id: 'tms_cust_1' },
        paymentInstrument: { id: 'pi_abc' },
      },
      orderInformation: {
        amountDetails: { billingAmount: '29.99', currency: 'USD' },
      },
      submitTimeUtc: '2023-11-14T10:00:00Z',
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_1')
    expect(result.customerId).toBe('tms_cust_1')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999)
    expect(result.defaultPaymentMethodId).toBe('pi_abc')
    expect(result.gateway).toBe('cybersource')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status', () => {
    const raw: RawCybersourceSubscription = {
      id: 'sub_2',
      subscriptionInformation: { status: 'CANCELLED' },
      paymentInformation: { customer: { id: 'tms_cust_2' } },
      orderInformation: {
        amountDetails: { billingAmount: '9.99', currency: 'EUR' },
      },
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps DELINQUENT to past_due', () => {
    const raw: RawCybersourceSubscription = {
      id: 'sub_3',
      subscriptionInformation: { status: 'DELINQUENT' },
      paymentInformation: { customer: { id: 'tms_cust_3' } },
      orderInformation: {
        amountDetails: { billingAmount: '15.00', currency: 'GBP' },
      },
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps metadata from plan and subscription info', () => {
    const raw: RawCybersourceSubscription = {
      id: 'sub_4',
      subscriptionInformation: { status: 'ACTIVE', planId: 'plan_basic', code: 'SUB-002' },
      planInformation: { code: 'BASIC', name: 'Basic Plan' },
      clientReferenceInformation: { code: 'ref-xyz' },
      paymentInformation: { customer: { id: 'tms_cust_4' } },
      orderInformation: {
        amountDetails: { billingAmount: '5.00', currency: 'USD' },
      },
    }
    const result = transformSubscription(raw)

    expect(result.metadata.planId).toBe('plan_basic')
    expect(result.metadata.planCode).toBe('BASIC')
    expect(result.metadata.clientReferenceCode).toBe('ref-xyz')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
