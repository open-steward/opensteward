import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPayabliRefund,
} from '../../../../../../../src/verticals/payments/adapters/payabli/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('payabli transformRefund', () => {
  it('maps a succeeded refund with all core fields', () => {
    const raw: RawPayabliRefund = {
      ReferenceData: 're_payabli_001',
      TransactionId: 'txn_001',
      NetAmount: 15,
      currency: 'USD',
      TransStatus: 'succeeded',
      TransactionDate: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('re_payabli_001')
    expect(result.chargeId).toBe('txn_001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('payabli')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed status and defaults currency to USD', () => {
    const raw: RawPayabliRefund = {
      ReferenceData: 're_002',
      TransactionId: 'txn_002',
      NetAmount: 5,
      TransStatus: 'failed',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
