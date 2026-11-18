import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawFlutterwaveTransfer,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('flutterwave transformPayout', () => {
  it('maps a "successful" transfer to status "paid"', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2001,
      reference: 'REF-2001',
      status: 'successful',
      amount: 200.0,
      currency: 'NGN',
      fee: 5.0,
      narration: 'Payout to vendor',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('2001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(20000)
    expect(result.currency).toBe('NGN')
    expect(result.statementDescriptor).toBe('Payout to vendor')
    expect(result.gateway).toBe('flutterwave')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "completed" transfer to status "paid"', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2002,
      status: 'completed',
      amount: 100.0,
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" transfer to status "pending"', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2003,
      status: 'pending',
      amount: 50.0,
      currency: 'GHS',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GHS')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "new" transfer to status "pending"', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2004,
      status: 'new',
      amount: 75.0,
      currency: 'NGN',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" transfer to status "failed"', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2005,
      status: 'failed',
      amount: 30.0,
      currency: 'NGN',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('stores reference and fee in metadata', () => {
    const raw: RawFlutterwaveTransfer = {
      id: 2006,
      reference: 'REF-2006',
      status: 'successful',
      amount: 80.0,
      currency: 'NGN',
      fee: 2.5,
    }
    const result = transformPayout(raw)
    expect(result.metadata['reference']).toBe('REF-2006')
    expect(result.metadata['fee']).toBe('2.5')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
