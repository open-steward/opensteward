import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawRazorpayPayout,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('razorpay transformPayout', () => {
  it('maps a processed IMPS payout to paid status with instant method', () => {
    const raw: RawRazorpayPayout = {
      id: 'pout_1',
      amount: 100000,
      currency: 'INR',
      status: 'processed',
      mode: 'IMPS',
      purpose: 'refund',
      reference_id: 'REF123',
      fees: 500,
      tax: 90,
      created_at: 1_700_000_000,
    }
    const result = transformPayout(raw)

    expect(result.id).toBe('pout_1')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('paid')
    expect(result.method).toBe('instant')
    expect(result.gateway).toBe('razorpay')
    expect(result.metadata.purpose).toBe('refund')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payout to pending status with standard method', () => {
    const raw: RawRazorpayPayout = {
      id: 'pout_2',
      amount: 50000,
      currency: 'INR',
      status: 'pending',
      mode: 'NEFT',
      created_at: 1_700_000_000,
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('pending')
    expect(result.method).toBe('standard')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a reversed payout to failed status', () => {
    const raw: RawRazorpayPayout = {
      id: 'pout_3',
      amount: 20000,
      currency: 'INR',
      status: 'reversed',
      mode: 'NEFT',
      created_at: 1_700_000_000,
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
