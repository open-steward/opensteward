import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawAirwallexTransfer,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('airwallex transformPayout', () => {
  it('maps status "COMPLETED" to "paid" and extracts last4 from account number', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-001',
      amount: 1000.0,
      currency: 'usd',
      status: 'COMPLETED',
      method: 'LOCAL',
      estimated_arrival_date: '2024-03-05T00:00:00+0000',
      beneficiary: {
        bank_details: { account_number: '0001234567890042' },
      },
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('tr-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('USD')
    expect(result.destinationLast4).toBe('0042')
    expect(result.gateway).toBe('airwallex')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "PROCESSING" to "in_transit"', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-002',
      amount: 500.0,
      currency: 'EUR',
      status: 'PROCESSING',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "PENDING" to "pending"', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-003',
      amount: 200.0,
      currency: 'GBP',
      status: 'PENDING',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "FAILED" to "failed" and exposes fail_reason', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-004',
      amount: 100.0,
      currency: 'AUD',
      status: 'FAILED',
      fail_reason: 'Account closed',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Account closed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "REVERSED" to "failed"', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-005',
      amount: 50.0,
      currency: 'CAD',
      status: 'REVERSED',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('sets destinationLast4 to undefined when account number is absent', () => {
    const raw: RawAirwallexTransfer = {
      id: 'tr-006',
      amount: 10.0,
      currency: 'USD',
      status: 'COMPLETED',
    }
    const result = transformPayout(raw)
    expect(result.destinationLast4).toBeUndefined()
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
