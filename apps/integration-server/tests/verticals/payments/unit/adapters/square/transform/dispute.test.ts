import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawSquareDispute,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('square transformDispute', () => {
  it('maps an EVIDENCE_REQUIRED dispute with FRAUD reason', () => {
    const raw: RawSquareDispute = {
      dispute_id: 'DISP-001',
      state: 'EVIDENCE_REQUIRED',
      reason: 'FRAUD',
      amount_money: { amount: 4500, currency: 'USD' },
      disputed_payment: { payment_id: 'PAY-999' },
      due_at: '2024-06-15T00:00:00Z',
      created_at: '2024-06-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('DISP-001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(4500)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('PAY-999')
    expect(result.evidenceDueBy).toBe('2024-06-15T00:00:00Z')
    expect(result.gateway).toBe('square')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a WON dispute', () => {
    const raw: RawSquareDispute = {
      dispute_id: 'DISP-002',
      state: 'WON',
      amount_money: { amount: 1000, currency: 'EUR' },
      disputed_payment: { payment_id: 'PAY-001' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a NOT_RECEIVED reason to "product_not_received"', () => {
    const raw: RawSquareDispute = {
      dispute_id: 'DISP-003',
      state: 'EVIDENCE_REQUIRED',
      reason: 'NOT_RECEIVED',
      amount_money: { amount: 2000, currency: 'GBP' },
      disputed_payment: { payment_id: 'PAY-002' },
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
