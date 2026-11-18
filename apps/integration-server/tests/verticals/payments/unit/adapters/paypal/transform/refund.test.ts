import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPayPalRefund,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paypal transformRefund', () => {
  it('maps a COMPLETED refund and extracts chargeId from links', () => {
    const raw: RawPayPalRefund = {
      id: 'REF-001',
      status: 'COMPLETED',
      amount: { value: '25.00', currency_code: 'USD' },
      links: [
        { rel: 'self', href: 'https://api.paypal.com/v2/payments/refunds/REF-001' },
        { rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAP-001' },
      ],
      create_time: '2024-04-15T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('CAP-001')
    expect(result.gateway).toBe('paypal')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund', () => {
    const raw: RawPayPalRefund = {
      id: 'REF-002',
      status: 'PENDING',
      amount: { value: '10.00', currency_code: 'EUR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED refund', () => {
    const raw: RawPayPalRefund = {
      id: 'REF-003',
      status: 'CANCELLED',
      amount: { value: '5.00', currency_code: 'GBP' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
