/**
 * cancelCharge takes a charge id (ch_…), and POST /v1/charges/{id} has no
 * `status` field — Stripe rejects a body that tries to set one. The only
 * ways to actually cancel a charge are:
 *
 *   - it has a PaymentIntent (the normal case): POST
 *     /payment_intents/{pi}/cancel, which returns a PaymentIntent, not a
 *     Charge, so the adapter has to re-read the charge afterward.
 *   - it does not (a legacy charge-only flow, captured outright): there is
 *     nothing to "cancel" in the PaymentIntent sense, so it is refunded via
 *     POST /refunds instead.
 *
 * These tests pin the exact request sequence (path, method, body) rather
 * than only checking the returned shape, since a wrong-path bug like the one
 * this fixes returns a 200 with usable-looking JSON — Stripe's charge-update
 * endpoint just silently ignores the unknown `status` field.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { StripeAdapter } from '../../../../../../src/verticals/payments/adapters/stripe'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/stripe/client', () => ({
  StripeClient: class {
    get = getMock
    post = postMock
    list = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new StripeAdapter({
  clientId: 'ca_test_client',
  clientSecret: 'sk_test_platform_secret',
  redirectUri: 'http://localhost:3010/auth/payments/stripe/callback',
})
const creds = { accessToken: 'sk_test_x' }

describe('StripeAdapter.cancelCharge', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('cancels the PaymentIntent when the charge has one, then re-reads the charge', async () => {
    const before = {
      id: 'ch_1',
      object: 'charge',
      amount: 1000,
      currency: 'usd',
      status: 'pending',
      captured: false,
      payment_intent: 'pi_1',
    }
    const after = { ...before, status: 'pending' }
    getMock.mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    postMock.mockResolvedValueOnce({ id: 'pi_1', object: 'payment_intent', status: 'canceled' })

    const result = await adapter.cancelCharge(creds, 'ch_1')

    // GET /charges/{id} first, to learn whether a PaymentIntent exists.
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(getMock.mock.calls[0]![0]).toBe('/charges/ch_1')

    // The cancel call targets the PaymentIntent id, never the charge id.
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]![0]).toBe('/payment_intents/pi_1/cancel')
    expect(postMock.mock.calls[0]![1]).toBeUndefined()
    // The bug this fixes posted to /charges/{id} with a status field.
    expect(postMock.mock.calls[0]![0]).not.toBe('/charges/ch_1')

    // Re-reads the charge (PaymentIntent.cancel returns a PaymentIntent, not
    // a Charge) and returns that transformed, not the PaymentIntent.
    expect(getMock.mock.calls[1]![0]).toBe('/charges/ch_1')
    expect(result.id).toBe('ch_1')
    expect(ChargeSchema.parse(result)).toEqual(result)
  })

  it('refunds instead when the charge has no PaymentIntent (legacy uncaptured charge)', async () => {
    const before = {
      id: 'ch_2',
      object: 'charge',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      captured: true,
      payment_intent: null,
    }
    const after = { ...before, refunded: true, amount_refunded: 500 }
    getMock.mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    postMock.mockResolvedValueOnce({ id: 're_1', object: 'refund' })

    const result = await adapter.cancelCharge(creds, 'ch_2')

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(getMock.mock.calls[0]![0]).toBe('/charges/ch_2')

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]).toEqual(['/refunds', { charge: 'ch_2' }])

    expect(getMock.mock.calls[1]![0]).toBe('/charges/ch_2')
    expect(result.status).toBe('refunded')
    expect(ChargeSchema.parse(result)).toEqual(result)
  })
})
