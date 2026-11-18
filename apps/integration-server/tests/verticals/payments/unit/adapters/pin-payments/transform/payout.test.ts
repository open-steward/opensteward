import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawPinTransfer,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('pin-payments transformPayout', () => {
  it('maps status "paid" to "paid"', () => {
    const raw: RawPinTransfer = {
      token: 'tr_paid',
      amount: 5000,
      currency: 'AUD',
      status: 'paid',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.id).toBe('tr_paid')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('pin-payments')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "processing" to "in_transit"', () => {
    const raw: RawPinTransfer = {
      token: 'tr_transit',
      amount: 2000,
      status: 'processing',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to "failed"', () => {
    const raw: RawPinTransfer = {
      token: 'tr_fail',
      amount: 1000,
      status: 'failed',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const raw: RawPinTransfer = {
      token: 'tr_cancel',
      amount: 750,
      status: 'cancelled',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to AUD when absent', () => {
    const raw: RawPinTransfer = { token: 'tr_aud', amount: 100, status: 'paid' }
    const result = transformPayout(raw)
    expect(result.currency).toBe('AUD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
