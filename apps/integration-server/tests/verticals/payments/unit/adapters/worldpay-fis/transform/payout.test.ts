import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawWorldpayPayoutItem,
} from '../../../../../../../src/verticals/payments/adapters/worldpay-fis/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('worldpay-fis transformPayout', () => {
  it('maps an EXECUTED payout to canonical status "paid"', () => {
    const raw: RawWorldpayPayoutItem = {
      payoutRequestId: 'pout_001',
      paymentId: 'pay_001',
      paymentDatetime: '2026-02-01T14:20:00.000Z',
      payeeName: 'Acme Corp',
      sourceCurrency: 'USD',
      sourceAmount: 50000,
      targetCurrency: 'USD',
      targetAmount: 50000,
      paymentState: 'EXECUTED',
      bankName: 'Chase',
      bankReference: 'BANKREF001',
      narrative: 'Monthly settlement',
      transactionReference: 'TXREF001',
      channel: 'SWIFT',
      countryCode: 'US',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('pout_001')
    expect(result.externalId).toBe('pout_001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.arrivalDate).toBe('2026-02-01T14:20:00.000Z')
    expect(result.statementDescriptor).toBe('Monthly settlement')
    expect(result.gateway).toBe('worldpay-fis')
    expect(result.metadata['payeeName']).toBe('Acme Corp')
    expect(result.metadata['bankName']).toBe('Chase')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PROCESSING payout to canonical status "in_transit"', () => {
    const raw: RawWorldpayPayoutItem = {
      payoutRequestId: 'pout_002',
      sourceCurrency: 'GBP',
      sourceAmount: 20000,
      paymentState: 'PROCESSING',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.currency).toBe('GBP')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payout to canonical status "pending"', () => {
    const raw: RawWorldpayPayoutItem = {
      payoutRequestId: 'pout_003',
      targetCurrency: 'EUR',
      targetAmount: 10000,
      paymentState: 'PENDING',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payout to canonical status "failed"', () => {
    const raw: RawWorldpayPayoutItem = {
      payoutRequestId: 'pout_004',
      targetCurrency: 'USD',
      targetAmount: 5000,
      paymentState: 'FAILED',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('prefers targetAmount/targetCurrency over source fields', () => {
    const raw: RawWorldpayPayoutItem = {
      payoutRequestId: 'pout_005',
      sourceCurrency: 'USD',
      sourceAmount: 10000,
      targetCurrency: 'EUR',
      targetAmount: 9200,
      paymentState: 'EXECUTED',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(9200)
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to paymentId when payoutRequestId is absent', () => {
    const raw: RawWorldpayPayoutItem = {
      paymentId: 'pay_fallback',
      targetCurrency: 'USD',
      targetAmount: 1000,
      paymentState: 'PAID',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('pay_fallback')
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
