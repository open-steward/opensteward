import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawPayPalDispute,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('paypal transformDispute', () => {
  it('maps an UNDER_REVIEW dispute with UNAUTHORISED reason', () => {
    const raw: RawPayPalDispute = {
      dispute_id: 'DISP-001',
      status: 'UNDER_REVIEW',
      reason: 'UNAUTHORISED',
      dispute_amount: { value: '75.00', currency_code: 'USD' },
      disputed_transactions: [{ seller_transaction_id: 'TXN-999' }],
      create_time: '2024-02-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('DISP-001')
    expect(result.status).toBe('under_review')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(7500)
    expect(result.chargeId).toBe('TXN-999')
    expect(result.gateway).toBe('paypal')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps RESOLVED status to "won"', () => {
    const raw: RawPayPalDispute = {
      dispute_id: 'DISP-002',
      status: 'RESOLVED',
      dispute_amount: { value: '20.00', currency_code: 'EUR' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps DUPLICATE_TRANSACTION reason to "duplicate"', () => {
    const raw: RawPayPalDispute = {
      dispute_id: 'DISP-003',
      status: 'OPEN',
      reason: 'DUPLICATE_TRANSACTION',
      dispute_amount: { value: '10.00', currency_code: 'USD' },
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
