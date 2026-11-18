import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaymobRefund,
} from '../../../../../../../src/verticals/payments/adapters/paymob/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paymob transformRefund', () => {
  it('maps a successful refund with a numeric parent_transaction id', () => {
    const raw: RawPaymobRefund = {
      id: 111222,
      parent_transaction: 987654,
      has_parent_transaction: true,
      amount_cents: 2500,
      currency: 'EGP',
      success: true,
      pending: false,
      error_occured: false,
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.id).toBe('111222')
    expect(result.externalId).toBe('111222')
    expect(result.chargeId).toBe('987654')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EGP')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paymob')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund and extracts failureReason', () => {
    const raw: RawPaymobRefund = {
      id: 333444,
      parent_transaction: { id: 999 },
      amount_cents: 1000,
      currency: 'EGP',
      success: false,
      pending: false,
      error_occured: true,
      data: { message: 'Refund rejected' },
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.chargeId).toBe('999')
    expect(result.failureReason).toBe('Refund rejected')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund when neither success nor error_occured is set', () => {
    const raw: RawPaymobRefund = {
      id: 555666,
      parent_transaction: 42,
      amount_cents: 500,
      currency: 'EGP',
      success: false,
      pending: false,
      error_occured: false,
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
