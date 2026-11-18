import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPawaPayRefund,
} from '../../../../../../../src/verticals/payments/adapters/pawapay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('pawapay transformRefund', () => {
  it('maps a successful refund with all core fields', () => {
    const raw: RawPawaPayRefund = {
      refundId: 'ref_001',
      depositId: 'dep_001',
      amount: 5,
      currency: 'ZMW',
      status: 'success',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('ref_001')
    expect(result.chargeId).toBe('dep_001')
    expect(result.amount).toBe(500)
    expect(result.currency).toBe('ZMW')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('pawapay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed status and defaults currency to ZMW', () => {
    const raw: RawPawaPayRefund = {
      refundId: 'ref_002',
      depositId: 'dep_002',
      amount: 2,
      status: 'failed',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.currency).toBe('ZMW')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
