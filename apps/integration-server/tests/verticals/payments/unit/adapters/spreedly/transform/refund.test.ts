import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSpreedlyRefund,
} from '../../../../../../../src/verticals/payments/adapters/spreedly/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('spreedly transformRefund', () => {
  it('maps a succeeded credit (refund) transaction', () => {
    const raw: RawSpreedlyRefund = {
      token: 're_spreedly_1',
      transaction_type: 'Credit',
      state: 'succeeded',
      succeeded: true,
      amount: 1000,
      currency_code: 'USD',
      reference_token: 'tok_original_1',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_spreedly_1')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('tok_original_1')
    expect(result.gateway).toBe('spreedly')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund with failure reason', () => {
    const raw: RawSpreedlyRefund = {
      token: 're_spreedly_2',
      transaction_type: 'Credit',
      state: 'failed',
      succeeded: false,
      amount: 500,
      currency_code: 'EUR',
      reference_token: 'tok_original_2',
      response: { message: 'Cannot credit this transaction' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Cannot credit this transaction')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawSpreedlyRefund = {
      token: 're_spreedly_3',
      state: 'pending',
      amount: 250,
      currency_code: 'GBP',
      reference_token: 'tok_original_3',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when currency_code absent', () => {
    const raw: RawSpreedlyRefund = {
      token: 're_spreedly_4',
      state: 'succeeded',
      succeeded: true,
      amount: 100,
      reference_token: 'tok_original_4',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('includes transaction_type in metadata', () => {
    const raw: RawSpreedlyRefund = {
      token: 're_spreedly_5',
      transaction_type: 'Refund',
      state: 'succeeded',
      succeeded: true,
      amount: 300,
      currency_code: 'CAD',
      reference_token: 'tok_original_5',
    }
    const result = transformRefund(raw)
    expect(result.metadata['transaction_type']).toBe('Refund')
    expect(result.metadata['state']).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
