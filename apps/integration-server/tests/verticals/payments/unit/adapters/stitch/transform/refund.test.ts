import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('stitch transformRefund', () => {
  it('maps id, amount, currency, status, and gateway fields', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_001',
      object: 'refund',
      amount: 2500,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_001',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_stitch_001')
    expect(result.externalId).toBe('re_stitch_001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('ch_001')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_002',
      object: 'refund',
      amount: 1000,
      currency: 'eur',
      status: 'succeeded',
      charge: 'ch_002',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps status "failed"', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_003',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      status: 'failed',
      charge: 'ch_003',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
  })

  it('maps status "canceled" to "cancelled"', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_004',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      status: 'canceled',
      charge: 'ch_004',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
  })

  it('maps reason "fraudulent"', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_005',
      object: 'refund',
      amount: 750,
      currency: 'usd',
      status: 'succeeded',
      reason: 'fraudulent',
      charge: 'ch_005',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
  })

  it('maps reason "requested_by_customer"', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_006',
      object: 'refund',
      amount: 750,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch_006',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('requested_by_customer')
  })

  it('uses payment_intent as chargeId when charge is absent', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_007',
      object: 'refund',
      amount: 1000,
      currency: 'usd',
      status: 'succeeded',
      charge: null,
      payment_intent: 'pi_001',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('pi_001')
  })

  it('maps receiptNumber and failureReason', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_008',
      object: 'refund',
      amount: 1000,
      currency: 'usd',
      status: 'failed',
      charge: 'ch_008',
      receipt_number: 'RN-001',
      failure_reason: 'lost_or_stolen_card',
    }
    const result = transformRefund(raw)
    expect(result.receiptNumber).toBe('RN-001')
    expect(result.failureReason).toBe('lost_or_stolen_card')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_009',
      object: 'refund',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_009',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes RefundSchema validation', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_010',
      object: 'refund',
      amount: 3000,
      currency: 'gbp',
      status: 'succeeded',
      reason: 'duplicate',
      charge: 'ch_010',
      created: 1709251200,
      metadata: { note: 'test' },
    }
    const result = transformRefund(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformRefund preserving chargeId and amount', () => {
    const raw: RawStripeRefund = {
      id: 're_stitch_011',
      object: 'refund',
      amount: 1500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      charge: 'ch_011',
      metadata: { ref: 'r99' },
    }
    const canonical = transformRefund(raw)
    const back = untransformRefund(canonical)
    expect(back.charge).toBe('ch_011')
    expect(back.amount).toBe(1500)
    expect(back.reason).toBe('requested_by_customer')
    expect((back.metadata as Record<string, string> | undefined)?.ref).toBe('r99')
  })
})
