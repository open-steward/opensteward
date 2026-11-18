import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaydockRefund,
} from '../../../../../../../src/verticals/payments/adapters/paydock/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paydock transformRefund', () => {
  it('maps a succeeded refund with reference_id as chargeId', () => {
    const raw: RawPaydockRefund = {
      _id: 're_paydock_001',
      reference_id: 'chg_001',
      amount: 15,
      currency: 'AUD',
      status: 'succeeded',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('re_paydock_001')
    expect(result.chargeId).toBe('chg_001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('AUD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paydock')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed status and defaults currency to AUD', () => {
    const raw: RawPaydockRefund = {
      _id: 're_002',
      reference_id: 'chg_002',
      amount: 5,
      status: 'failed',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.currency).toBe('AUD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
