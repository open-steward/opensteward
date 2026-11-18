import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawUnzerPayout,
} from '../../../../../../../src/verticals/payments/adapters/unzer/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('unzer transformPayout', () => {
  it('maps a successful payout to status "paid"', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-001',
      amount: '250.00',
      currency: 'EUR',
      date: '2024-03-15 10:00:00',
      isSuccess: true,
      resources: {
        paymentId: 's-pay-001',
        typeId: 's-crd-abc',
      },
      processing: {
        uniqueId: 'uniq-out-001',
        shortId: 'short-out-001',
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('EUR')
    expect(result.id).toBe('s-out-001')
    expect(result.externalId).toBe('s-out-001')
    expect(result.gateway).toBe('unzer')
    expect(result.metadata.paymentId).toBe('s-pay-001')
    expect(result.metadata.typeId).toBe('s-crd-abc')
    expect(result.metadata.shortId).toBe('short-out-001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payout to status "pending"', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-002',
      amount: '100.00',
      currency: 'USD',
      isPending: true,
      resources: { paymentId: 's-pay-002' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payout to status "failed" with failure message', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-003',
      amount: '75.00',
      currency: 'EUR',
      isError: true,
      message: { merchant: 'Account not found', customer: 'Payout failed' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Account not found')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to customer message when merchant message is absent', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-004',
      amount: '50.00',
      currency: 'EUR',
      isError: true,
      message: { customer: 'Processing error' },
    }
    const result = transformPayout(raw)
    expect(result.failureMessage).toBe('Processing error')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when missing', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-005',
      amount: '30.00',
      isSuccess: true,
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(3000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" when no flags are set', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-006',
      amount: '10.00',
      currency: 'GBP',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('handles zero-decimal currency (JPY) without multiplying', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-007',
      amount: '5000',
      currency: 'JPY',
      isSuccess: true,
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('JPY')
    expect(result.amount).toBe(5000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('includes createdAt when date is provided', () => {
    const raw: RawUnzerPayout = {
      id: 's-out-008',
      amount: '20.00',
      currency: 'EUR',
      isSuccess: true,
      date: '2024-05-01 09:00:00',
    }
    const result = transformPayout(raw)
    expect(result.createdAt).toBeDefined()
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
