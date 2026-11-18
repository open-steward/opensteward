import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawStripeCharge,
} from '../../../../../src/verticals/payments/adapters/stripe/transform/charge'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../src/verticals/payments/adapters/stripe/transform/customer'
import {
  transformRefund,
  type RawStripeRefund,
} from '../../../../../src/verticals/payments/adapters/stripe/transform/refund'
import {
  parseStripeWebhookEvents,
  verifyStripeWebhook,
} from '../../../../../src/verticals/payments/adapters/stripe/webhook'
import { createHmac } from 'node:crypto'

describe('stripe transform', () => {
  it('maps a refunded Charge to canonical with currency upper-cased', () => {
    const raw: RawStripeCharge = {
      id: 'ch_1',
      object: 'charge',
      amount: 2500,
      amount_refunded: 1000,
      currency: 'usd',
      status: 'succeeded',
      paid: true,
      customer: 'cus_1',
      payment_method: 'pm_1',
      receipt_url: 'https://stripe/r/1',
      metadata: { orderId: '42' },
      created: 1_700_000_000,
    }
    const canonical = transformCharge(raw)
    expect(canonical.currency).toBe('USD')
    expect(canonical.amount).toBe(2500)
    expect(canonical.amountRefunded).toBe(1000)
    expect(canonical.status).toBe('partially_refunded')
    expect(canonical.customerId).toBe('cus_1')
    expect(canonical.metadata.orderId).toBe('42')
    expect(canonical.createdAt).toMatch(/^2023-/)
  })

  it('round-trips a Customer through transform → untransform', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_1',
      object: 'customer',
      email: 'a@b.test',
      name: 'Alice',
      currency: 'gbp',
      address: {
        line1: '1 St',
        city: 'London',
        postal_code: 'EC1',
        country: 'GB',
      },
      metadata: { tier: 'pro' },
    }
    const canonical = transformCustomer(raw)
    expect(canonical.email).toBe('a@b.test')
    expect(canonical.currency).toBe('GBP')
    expect(canonical.billingAddress?.country).toBe('GB')

    const back = untransformCustomer(canonical)
    expect(back.email).toBe('a@b.test')
    expect(back.currency).toBe('gbp')
    expect((back.address as Record<string, unknown> | undefined)?.country).toBe('GB')
  })

  it('maps a Stripe Refund', () => {
    const raw: RawStripeRefund = {
      id: 're_1',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'fraudulent',
      charge: 'ch_1',
      metadata: {},
    }
    const canonical = transformRefund(raw)
    expect(canonical.status).toBe('succeeded')
    expect(canonical.reason).toBe('fraudulent')
    expect(canonical.chargeId).toBe('ch_1')
  })
})

describe('stripe webhook', () => {
  it('verifies a signed payload', () => {
    const secret = 'whsec_test'
    const body = JSON.stringify({ id: 'evt_1', type: 'charge.succeeded' })
    const t = Math.floor(Date.now() / 1000)
    const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    const verified = verifyStripeWebhook(
      Buffer.from(body, 'utf8'),
      { 'stripe-signature': `t=${t},v1=${sig}` },
      secret,
    )
    expect(verified).toBe(true)
  })

  it('rejects a wrong signature', () => {
    const t = Math.floor(Date.now() / 1000)
    const verified = verifyStripeWebhook(
      Buffer.from('{}', 'utf8'),
      { 'stripe-signature': `t=${t},v1=deadbeef` },
      'whsec_test',
    )
    expect(verified).toBe(false)
  })

  it('classifies a charge.succeeded event', () => {
    const events = parseStripeWebhookEvents({
      id: 'evt_1',
      type: 'charge.succeeded',
      data: { object: { id: 'ch_1' } },
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('charges')
    expect(events[0]!.action).toBe('succeeded')
    expect(events[0]!.resourceId).toBe('ch_1')
  })
})
