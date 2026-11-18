import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAffirmRefund,
} from '../../../../../../../src/verticals/payments/adapters/affirm/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('affirm transformRefund', () => {
  it('maps a refund with amount passed through as-is (minor units) and status always succeeded', () => {
    const raw: RawAffirmRefund = {
      id: 'affirm-refund-001',
      amount: 1500,
      type: 'partial',
      created: '2024-03-05T10:00:00Z',
      charge_id: 'affirm-charge-001',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('affirm-refund-001')
    expect(result.chargeId).toBe('affirm-charge-001')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('affirm')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('returns 0 amount when amount is undefined', () => {
    const raw: RawAffirmRefund = {
      id: 'affirm-refund-002',
      charge_id: 'affirm-charge-002',
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(0)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('always sets currency to USD regardless of input', () => {
    const raw: RawAffirmRefund = {
      id: 'affirm-refund-003',
      amount: 200,
      charge_id: 'affirm-charge-003',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
