import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawEwayRefund,
} from '../../../../../../../src/verticals/payments/adapters/eway/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('eway transformRefund', () => {
  it('maps an approved refund to status "succeeded"', () => {
    const raw: RawEwayRefund = {
      TransactionID: 99991111,
      TransactionStatus: true,
      TransactionDateTime: '2024-03-01T00:00:00Z',
      ResponseCode: '00',
      ResponseMessage: 'A2000',
      Refund: {
        TotalAmount: 2500,
        CurrencyCode: 'AUD',
        TransactionID: 12345678,
        InvoiceNumber: 'INV-001',
        InvoiceReference: 'REF-001',
      },
    }
    const result = transformRefund(raw, '12345678')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('eway')
    expect(result.chargeId).toBe('12345678')
    expect(result.id).toBe('99991111')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a declined refund to status "failed"', () => {
    const raw: RawEwayRefund = {
      TransactionID: 99992222,
      TransactionStatus: false,
      TransactionDateTime: '2024-03-01T00:00:00Z',
      ResponseCode: '05',
      ResponseMessage: 'D4401',
      Refund: {
        TotalAmount: 1000,
        CurrencyCode: 'AUD',
        TransactionID: 12345678,
      },
    }
    const result = transformRefund(raw, '12345678')
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('D4401')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to Refund.TransactionID for chargeId when not provided', () => {
    const raw: RawEwayRefund = {
      TransactionID: 99993333,
      TransactionStatus: true,
      ResponseCode: '00',
      Refund: {
        TotalAmount: 500,
        CurrencyCode: 'AUD',
        TransactionID: 55555555,
      },
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('55555555')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
