import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawOpnTransfer,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('opn-payments transformPayout', () => {
  it('maps paid transfer to canonical payout with status paid', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_test_123',
      amount: 100000,
      currency: 'thb',
      paid: true,
      sent: false,
      bank_account: { last_digits: '6789' },
      paid_at: '2024-03-05T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('trsf_test_123')
    expect(result.externalId).toBe('trsf_test_123')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('THB')
    expect(result.status).toBe('paid')
    expect(result.method).toBe('standard')
    expect(result.destinationLast4).toBe('6789')
    expect(result.arrivalDate).toBe('2024-03-05T00:00:00Z')
    expect(result.gateway).toBe('opn-payments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps sent (but not paid) transfer to in_transit', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_sent',
      amount: 50000,
      currency: 'thb',
      paid: false,
      sent: true,
      sent_at: '2024-03-03T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.arrivalDate).toBe('2024-03-03T00:00:00Z')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps failure_code to failed status', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_fail',
      amount: 20000,
      currency: 'thb',
      paid: false,
      sent: false,
      failure_code: 'insufficient_funds',
      failure_message: 'Not enough funds',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('insufficient_funds')
    expect(result.failureMessage).toBe('Not enough funds')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending when not paid, not sent, no failure', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_pending',
      amount: 10000,
      currency: 'thb',
      paid: false,
      sent: false,
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to THB when missing', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_nocur',
      amount: 5000,
      paid: false,
      sent: false,
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('THB')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('prefers paid_at over sent_at for arrivalDate', () => {
    const raw: RawOpnTransfer = {
      id: 'trsf_both_dates',
      amount: 1000,
      paid: true,
      sent: true,
      paid_at: '2024-03-10T00:00:00Z',
      sent_at: '2024-03-08T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.arrivalDate).toBe('2024-03-10T00:00:00Z')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
