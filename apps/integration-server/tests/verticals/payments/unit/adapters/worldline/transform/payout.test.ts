import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawWorldlinePayout,
} from '../../../../../../../src/verticals/payments/adapters/worldline/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('worldline transformPayout', () => {
  it('maps ACCOUNT_CREDITED status to "paid"', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-001',
      status: 'ACCOUNT_CREDITED',
      payoutOutput: {
        amountOfMoney: { amount: 20000, currencyCode: 'EUR' },
        references: { merchantReference: 'mref-p1', paymentReference: 'pref-p1' },
      },
      statusOutput: {
        statusCode: 9,
        statusCategory: 'COMPLETED',
        statusCodeChangeDateTime: '20240301000000',
      },
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('wl-payout-001')
    expect(result.amount).toBe(20000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('worldline')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps PAYOUT_REQUESTED status to "pending"', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-002',
      status: 'PAYOUT_REQUESTED',
      payoutOutput: {
        amountOfMoney: { amount: 5000, currencyCode: 'GBP' },
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps REJECTED status to "failed"', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-003',
      status: 'REJECTED',
      payoutOutput: {
        amountOfMoney: { amount: 1000, currencyCode: 'EUR' },
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "cancelled"', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-004',
      status: 'CANCELLED',
      payoutOutput: {
        amountOfMoney: { amount: 3000, currencyCode: 'USD' },
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when currencyCode is absent', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-005',
      status: 'CREATED',
      payoutOutput: {
        amountOfMoney: { amount: 500 },
      },
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('packs merchant and provider references into metadata', () => {
    const raw: RawWorldlinePayout = {
      id: 'wl-payout-006',
      status: 'ACCOUNT_CREDITED',
      payoutOutput: {
        amountOfMoney: { amount: 1000, currencyCode: 'EUR' },
        references: { merchantReference: 'mref-6', providerReference: 'provref-6' },
      },
    }
    const result = transformPayout(raw)
    expect(result.metadata['merchantReference']).toBe('mref-6')
    expect(result.metadata['providerReference']).toBe('provref-6')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
