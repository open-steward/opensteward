import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMoyasarRefund,
} from '../../../../../../../src/verticals/payments/adapters/moyasar/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('moyasar transformRefund', () => {
  it('maps id, payment_id as chargeId, amount, currency (upper-cased), and status "succeeded"', () => {
    const raw: RawMoyasarRefund = {
      id: 'ref-001',
      payment_id: 'pay-001',
      amount: 800,
      currency: 'sar',
      status: 'success',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.amount).toBe(800)
    expect(result.currency).toBe('SAR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('moyasar')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" correctly', () => {
    const raw: RawMoyasarRefund = {
      id: 'ref-002',
      payment_id: 'pay-002',
      amount: 400,
      currency: 'SAR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to "pending" for an unknown status', () => {
    const raw: RawMoyasarRefund = {
      id: 'ref-003',
      payment_id: 'pay-003',
      amount: 200,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
