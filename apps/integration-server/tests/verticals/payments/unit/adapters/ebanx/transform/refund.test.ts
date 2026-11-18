import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawEbanxRefund,
} from '../../../../../../../src/verticals/payments/adapters/ebanx/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('ebanx transformRefund', () => {
  it('maps a CO refund to status "succeeded"', () => {
    const raw: RawEbanxRefund = {
      id: 'REF-001',
      merchant_refund_code: 'mrc-001',
      status: 'CO',
      amount_ext: '50.00',
      currency_ext: 'BRL',
      request_date: '2024-03-01 00:00:00',
      confirm_date: '2024-03-02 10:00:00',
    }
    const result = transformRefund(raw, 'EBANX-HASH-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('BRL')
    expect(result.gateway).toBe('ebanx')
    expect(result.id).toBe('REF-001')
    expect(result.chargeId).toBe('EBANX-HASH-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PE refund to status "pending"', () => {
    const raw: RawEbanxRefund = {
      id: 'REF-002',
      status: 'PE',
      amount_ext: '25.00',
      currency_ext: 'USD',
      request_date: '2024-03-01 00:00:00',
    }
    const result = transformRefund(raw, 'EBANX-HASH-002')
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CA refund to status "cancelled"', () => {
    const raw: RawEbanxRefund = {
      id: 'REF-003',
      status: 'CA',
      amount_ext: '30.00',
      currency_ext: 'BRL',
      request_date: '2024-03-01 00:00:00',
      cancel_date: '2024-03-01 15:00:00',
    }
    const result = transformRefund(raw, 'EBANX-HASH-003')
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
