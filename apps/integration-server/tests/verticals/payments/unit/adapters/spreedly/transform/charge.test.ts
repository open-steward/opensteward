import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawSpreedlyTransaction,
} from '../../../../../../../src/verticals/payments/adapters/spreedly/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('spreedly transformCharge', () => {
  it('maps a succeeded purchase transaction', () => {
    const raw: RawSpreedlyTransaction = {
      token: 'tok_spreedly_1',
      transaction_type: 'Purchase',
      state: 'succeeded',
      succeeded: true,
      amount: 4999,
      currency_code: 'USD',
      description: 'Order #42',
      email: 'buyer@example.com',
      payment_method: { token: 'pm_spreedly_1', email: 'buyer@example.com' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('tok_spreedly_1')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.paymentMethodId).toBe('pm_spreedly_1')
    expect(result.gateway).toBe('spreedly')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorization as not captured', () => {
    const raw: RawSpreedlyTransaction = {
      token: 'tok_spreedly_2',
      transaction_type: 'Authorization',
      state: 'succeeded',
      succeeded: true,
      amount: 2000,
      currency_code: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.captured).toBe(false)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a gateway_processing_failed state to failed', () => {
    const raw: RawSpreedlyTransaction = {
      token: 'tok_spreedly_3',
      transaction_type: 'Purchase',
      state: 'gateway_processing_failed',
      succeeded: false,
      amount: 1000,
      currency_code: 'GBP',
      response: { message: 'Card declined', error_code: 'card_declined' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Card declined')
    expect(result.failureCode).toBe('card_declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps pending state', () => {
    const raw: RawSpreedlyTransaction = {
      token: 'tok_spreedly_4',
      transaction_type: 'Purchase',
      state: 'pending',
      amount: 500,
      currency_code: 'AUD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('AUD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when currency_code absent', () => {
    const raw: RawSpreedlyTransaction = {
      token: 'tok_spreedly_5',
      state: 'succeeded',
      succeeded: true,
      amount: 100,
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
