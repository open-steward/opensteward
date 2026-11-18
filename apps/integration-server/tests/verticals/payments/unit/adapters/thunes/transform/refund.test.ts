import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawThunesRefund,
} from '../../../../../../../src/verticals/payments/adapters/thunes/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('thunes transformRefund', () => {
  it('maps a successful refund correctly', () => {
    const raw: RawThunesRefund = {
      id: 'ref_001',
      transaction_id: 'tx_001',
      status: 'success',
      source_amount: 1.5,
      currency: 'USD',
      creation_date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.chargeId).toBe('tx_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(150)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('thunes')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "completed" status to "succeeded"', () => {
    const raw: RawThunesRefund = {
      id: 'ref_002',
      transaction_id: 'tx_002',
      status: 'completed',
      source_amount: 50,
      currency: 'EUR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a declined refund to status "failed"', () => {
    const raw: RawThunesRefund = {
      id: 'ref_003',
      transaction_id: 'tx_003',
      status: 'declined',
      source_amount: 25,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('treats unknown status as "pending"', () => {
    const raw: RawThunesRefund = {
      id: 'ref_004',
      transaction_id: 'tx_004',
      status: 'in_progress',
      source_amount: 10,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to USD when currency is absent', () => {
    const raw: RawThunesRefund = {
      id: 'ref_005',
      transaction_id: 'tx_005',
      status: 'success',
      source_amount: 8,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
