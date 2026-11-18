import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTapRefund,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('tap-payments transformRefund', () => {
  it('maps a REFUNDED refund to status "succeeded"', () => {
    const raw: RawTapRefund = {
      id: 'ref_001',
      charge_id: 'chg_001',
      status: 'REFUNDED',
      amount: 50,
      currency: 'AED',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AED')
    expect(result.chargeId).toBe('chg_001')
    expect(result.gateway).toBe('tap-payments')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund to status "pending"', () => {
    const raw: RawTapRefund = {
      id: 'ref_002',
      charge_id: 'chg_002',
      status: 'PENDING',
      amount: 100,
      currency: 'AED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED refund to status "failed" with failureReason', () => {
    const raw: RawTapRefund = {
      id: 'ref_003',
      charge_id: 'chg_003',
      status: 'DECLINED',
      amount: 75,
      currency: 'USD',
      response: { code: '05', message: 'Insufficient funds' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Insufficient funds')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an ACCEPTED refund to status "pending"', () => {
    const raw: RawTapRefund = {
      id: 'ref_004',
      charge_id: 'chg_004',
      status: 'ACCEPTED',
      amount: 20,
      currency: 'AED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.id).toBe('ref_004')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('does not set failureReason on successful refund', () => {
    const raw: RawTapRefund = {
      id: 'ref_005',
      charge_id: 'chg_005',
      status: 'REFUNDED',
      amount: 10,
      currency: 'AED',
      response: { code: '00', message: 'Approved' },
    }
    const result = transformRefund(raw)
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
