import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawRazorpayDispute,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('razorpay transformDispute', () => {
  it('maps an open dispute with fraud reason code', () => {
    const raw: RawRazorpayDispute = {
      id: 'disp_1',
      payment_id: 'pay_42',
      amount: 8000,
      currency: 'INR',
      status: 'open',
      reason_code: 'fraud',
      respond_by: 1_703_000_000,
      created_at: 1_700_000_000,
      updated_at: 1_700_500_000,
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('disp_1')
    expect(result.chargeId).toBe('pay_42')
    expect(result.amount).toBe(8000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('under_review')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('razorpay')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawRazorpayDispute = {
      id: 'disp_2',
      payment_id: 'pay_43',
      amount: 2000,
      currency: 'INR',
      status: 'won',
      created_at: 1_700_000_000,
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
