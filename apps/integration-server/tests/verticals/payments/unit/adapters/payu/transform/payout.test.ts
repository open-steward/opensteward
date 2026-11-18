import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawPayuPayout,
} from '../../../../../../../src/verticals/payments/adapters/payu/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('payu transformPayout', () => {
  it('maps a FINALIZED payout to paid status', () => {
    const raw: RawPayuPayout = {
      payoutId: 'pay_1',
      extPayoutId: 'ext_p_001',
      amount: '10000',
      status: 'FINALIZED',
      description: 'Weekly payout',
      createdAt: '2023-11-14T10:00:00+01:00',
      fxData: { currencyCode: 'PLN', rate: '1.0' },
    }
    const result = transformPayout(raw)

    expect(result.id).toBe('pay_1')
    expect(result.externalId).toBe('ext_p_001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('PLN')
    expect(result.status).toBe('paid')
    expect(result.statementDescriptor).toBe('Weekly payout')
    expect(result.gateway).toBe('payu')
    expect(result.metadata.fxRate).toBe('1.0')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps IN_PROGRESS to in_transit', () => {
    const raw: RawPayuPayout = {
      payoutId: 'pay_2',
      amount: '5000',
      status: 'IN_PROGRESS',
      fxData: { currencyCode: 'EUR' },
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('in_transit')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status', () => {
    const raw: RawPayuPayout = {
      payoutId: 'pay_3',
      amount: '2000',
      status: 'FAILED',
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('failed')
    expect(result.currency).toBe('PLN')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED to cancelled', () => {
    const raw: RawPayuPayout = {
      payoutId: 'pay_4',
      amount: '3000',
      status: 'CANCELED',
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to PLN via fxData fallback', () => {
    const raw: RawPayuPayout = {
      payoutId: 'pay_5',
      amount: '100',
      status: 'PENDING',
    }
    const result = transformPayout(raw)

    expect(result.currency).toBe('PLN')
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
