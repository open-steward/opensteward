import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCellulantRefund,
} from '../../../../../../../src/verticals/payments/adapters/cellulant/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const baseRaw: RawCellulantRefund = {
  status: { status_code: 200, status_description: 'Refund logged' },
  results: {
    refund_id: 'REF-001',
    refund_reference: 'REFREF-001',
    merchant_transaction_id: 'MTX-001',
    payment_id: 'PAY-001',
    amount: '50.00',
    currency_code: 'KES',
    refund_status: 'SUCCESS',
    date_created: '2024-03-01 00:00:00',
  },
}

const baseFallback = { chargeId: 'MTX-001', amount: 5000, currency: 'KES' }

describe('cellulant transformRefund', () => {
  it('maps refund_status "SUCCESS" to status "succeeded"', () => {
    const result = transformRefund(baseRaw, baseFallback)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cellulant')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('converts major-unit amount (50.00) to minor units (5000)', () => {
    const result = transformRefund(baseRaw, baseFallback)
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('KES')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps refund_status "FAILED" to status "failed"', () => {
    const raw: RawCellulantRefund = {
      ...baseRaw,
      results: { ...baseRaw.results, refund_status: 'FAILED' },
    }
    const result = transformRefund(raw, baseFallback)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('surfaces chargeId from the results merchant_transaction_id', () => {
    const result = transformRefund(baseRaw, baseFallback)
    expect(result.chargeId).toBe('MTX-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to chargeId from fallback when merchant_transaction_id is absent', () => {
    const raw: RawCellulantRefund = {
      status: { status_code: 200 },
      results: { refund_id: 'REF-002', refund_status: 'SUCCESS' },
    }
    const result = transformRefund(raw, { chargeId: 'FALLBACK-TX', amount: 100, currency: 'KES' })
    expect(result.chargeId).toBe('FALLBACK-TX')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
