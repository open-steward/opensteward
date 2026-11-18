import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawKlarnaPayout,
} from '../../../../../../../src/verticals/payments/adapters/klarna/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('klarna transformPayout', () => {
  it('maps a Klarna settlement payout to canonical Payout', () => {
    const raw: RawKlarnaPayout = {
      payment_reference: 'PAY-2024-001',
      payout_date: '2024-03-01T00:00:00Z',
      settlement_currency: 'sek',
      total_settlement_amount: 98500,
      merchant_id: 'merchant-123',
      merchant_settlement_type: 'standard',
      total_sale_amount: 100000,
      total_fee_amount: 1500,
      total_return_amount: 0,
      total_reversal_amount: 0,
    }
    const result = transformPayout(raw)

    expect(result.id).toBe('PAY-2024-001')
    expect(result.externalId).toBe('PAY-2024-001')
    expect(result.amount).toBe(98500)
    expect(result.currency).toBe('SEK')
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('klarna')
    expect(result.arrivalDate).toBe('2024-03-01T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.metadata.merchant_id).toBe('merchant-123')
    expect(result.metadata.merchant_settlement_type).toBe('standard')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when settlement_currency is missing', () => {
    const raw: RawKlarnaPayout = {
      payment_reference: 'PAY-2024-002',
      total_settlement_amount: 5000,
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('returns 0 for amount when total_settlement_amount is missing', () => {
    const raw: RawKlarnaPayout = {
      payment_reference: 'PAY-2024-003',
      settlement_currency: 'EUR',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(0)
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('always returns paid status regardless of raw shape', () => {
    const raw: RawKlarnaPayout = {
      payment_reference: 'PAY-2024-004',
      total_settlement_amount: 12000,
      settlement_currency: 'NOK',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
