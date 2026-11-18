import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('rapyd transformDispute', () => {
  it('maps a fraud dispute in needs_response state', () => {
    const raw = {
      id: 'dispute_abc',
      payment: 'payment_ch1',
      amount: 75.0,
      currency: 'USD',
      status: 'waiting_for_merchant',
      reason_code: 'fraud',
      reason_description: 'Customer claims fraud',
      network: 'visa',
      created_at: 1_700_000_000,
      updated_at: 1_700_001_000,
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dispute_abc')
    expect(result.externalId).toBe('dispute_abc')
    expect(result.chargeId).toBe('payment_ch1')
    expect(result.amount).toBe(7500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.network).toBe('visa')
    expect(result.gateway).toBe('rapyd')
    expect(result.metadata.reason_description).toBe('Customer claims fraud')
    expect(result.metadata.reason_code).toBe('fraud')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back to token field when id is absent', () => {
    const raw = {
      token: 'dispute_token_1',
      payment: 'payment_ch2',
      amount: 20.0,
      currency_code: 'EUR',
      status: 'won',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('dispute_token_1')
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "under_review" correctly', () => {
    const raw = {
      id: 'dispute_review',
      payment: 'payment_ch3',
      amount: 50.0,
      currency: 'GBP',
      status: 'under_review',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "lost" correctly', () => {
    const raw = {
      id: 'dispute_lost',
      payment: 'payment_ch4',
      amount: 10.0,
      currency: 'USD',
      status: 'rejected',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
