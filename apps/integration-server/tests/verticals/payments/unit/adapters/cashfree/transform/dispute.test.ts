import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawCashfreeDispute,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('cashfree transformDispute', () => {
  it('maps an action-required dispute', () => {
    const raw: RawCashfreeDispute = {
      dispute_id: 'disp-001',
      dispute_type: 'CHARGEBACK',
      reason_code: 'FRAUD',
      dispute_amount: 500,
      dispute_amount_currency: 'INR',
      dispute_status: 'DISPUTE_ACTION_REQUIRED',
      created_at: '2024-03-01T00:00:00Z',
      order_details: { order_id: 'ord-001', cf_payment_id: 'cfpay-001' },
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('disp-001')
    expect(result.chargeId).toBe('ord-001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('cashfree')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a won dispute', () => {
    const raw: RawCashfreeDispute = {
      dispute_id: 'disp-002',
      dispute_status: 'CHARGEBACK_MERCHANT_WON',
      dispute_amount: 1000,
      dispute_amount_currency: 'INR',
      created_at: '2024-03-01T00:00:00Z',
      order_details: { order_id: 'ord-002' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a lost dispute', () => {
    const raw: RawCashfreeDispute = {
      dispute_id: 'disp-003',
      dispute_status: 'CHARGEBACK_CUSTOMER_WON',
      dispute_amount: 750,
      dispute_amount_currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
      order_details: { order_id: 'ord-003' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(result.currency).toBe('USD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
