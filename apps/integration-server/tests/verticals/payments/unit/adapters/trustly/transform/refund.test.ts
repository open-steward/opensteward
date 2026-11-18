import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTrustlyRefund,
} from '../../../../../../../src/verticals/payments/adapters/trustly/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('trustly transformRefund', () => {
  it('maps an accepted refund result (result=1) to succeeded', () => {
    const raw: RawTrustlyRefund = {
      orderid: 'REFUND_001',
      result: '1',
      refundorderid: 'ORDER_001',
      amount: '25.00',
      currency: 'EUR',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REFUND_001')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('ORDER_001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('trustly')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-accepted refund to pending', () => {
    const raw: RawTrustlyRefund = {
      orderid: 'REFUND_002',
      result: '0',
      refundorderid: 'ORDER_002',
      amount: '10.00',
      currency: 'SEK',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('ORDER_002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a ledger-style refund row (no result field)', () => {
    const raw: RawTrustlyRefund = {
      orderid: 'REFUND_003',
      gluepayid: 'GLUE_003',
      transactiontype: 'refund',
      amount: '99.00',
      currency: 'USD',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(9900)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
