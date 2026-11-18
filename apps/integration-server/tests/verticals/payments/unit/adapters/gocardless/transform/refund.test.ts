import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawGCRefund,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('gocardless transformRefund', () => {
  it('maps a refund to canonical Refund with status "succeeded"', () => {
    const raw: RawGCRefund = {
      id: 'RF001',
      amount: 1500,
      currency: 'gbp',
      reference: 'REF-REFUND-001',
      links: { payment: 'PM001', mandate: 'MD001' },
      created_at: '2024-02-20T09:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('RF001')
    expect(result.chargeId).toBe('PM001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('gocardless')
    expect(result.metadata.reference).toBe('REF-REFUND-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('always returns status "succeeded" regardless of input', () => {
    const raw: RawGCRefund = {
      id: 'RF002',
      amount: 500,
      currency: 'eur',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps createdAt from created_at field', () => {
    const raw: RawGCRefund = {
      id: 'RF003',
      amount: 800,
      currency: 'gbp',
      created_at: '2024-03-15T12:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.createdAt).toBe('2024-03-15T12:00:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
