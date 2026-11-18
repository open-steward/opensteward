import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawEwayPayment,
} from '../../../../../../../src/verticals/payments/adapters/eway/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('eway transformCharge', () => {
  it('maps an approved captured transaction to status "succeeded"', () => {
    const raw: RawEwayPayment = {
      TransactionID: 12345678,
      TransactionStatus: true,
      TransactionType: 'Purchase',
      TransactionCaptured: true,
      TransactionDateTime: '2024-03-01T00:00:00Z',
      ResponseCode: '00',
      ResponseMessage: 'A2000',
      AuthorisationCode: 'AUTH001',
      Payment: {
        TotalAmount: 5000,
        CurrencyCode: 'AUD',
        InvoiceNumber: 'INV-001',
        InvoiceReference: 'REF-001',
        InvoiceDescription: 'Test purchase',
      },
      Customer: {
        TokenCustomerID: 987654,
        Email: 'buyer@example.com',
        Reference: 'CUST-001',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('eway')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('987654')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an approved but uncaptured transaction to status "pending"', () => {
    const raw: RawEwayPayment = {
      TransactionID: 12345679,
      TransactionStatus: true,
      TransactionCaptured: false,
      TransactionDateTime: '2024-03-01T00:00:00Z',
      ResponseCode: '00',
      Payment: {
        TotalAmount: 3000,
        CurrencyCode: 'AUD',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined transaction to status "failed"', () => {
    const raw: RawEwayPayment = {
      TransactionID: 12345680,
      TransactionStatus: false,
      TransactionCaptured: false,
      TransactionDateTime: '2024-03-01T00:00:00Z',
      ResponseCode: '05',
      ResponseMessage: 'D4401',
      Errors: 'V6010',
      Payment: {
        TotalAmount: 1000,
        CurrencyCode: 'AUD',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('05')
    expect(result.failureMessage).toBe('D4401')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
