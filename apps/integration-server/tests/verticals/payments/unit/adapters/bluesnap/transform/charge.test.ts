import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBluesnapTransaction,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('bluesnap transformCharge', () => {
  it('maps a SUCCESS AUTH_CAPTURE transaction to status "succeeded" with correct amount', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-001',
      amount: 49.99,
      currency: 'USD',
      cardTransactionType: 'AUTH_CAPTURE',
      vaultedShopperId: 'SHOPPER-42',
      softDescriptor: 'ACME*SHOP',
      processingInfo: { processingStatus: 'SUCCESS' },
      cardHolderInfo: { email: 'buyer@example.com' },
      transactionApprovalDate: '01-Mar-24',
      transactionApprovalTime: '00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('TXN-001')
    expect(result.status).toBe('succeeded')
    // 49.99 → 4999 cents
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('SHOPPER-42')
    expect(result.statementDescriptor).toBe('ACME*SHOP')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('bluesnap')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transaction to status "pending"', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-002',
      amount: 100.0,
      currency: 'EUR',
      processingInfo: { processingStatus: 'PENDING' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAIL transaction to status "failed"', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-003',
      amount: 50.0,
      currency: 'USD',
      processingInfo: { processingStatus: 'FAIL' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUNDED transaction to status "refunded"', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-004',
      amount: 75.0,
      currency: 'USD',
      refundedAmount: 75.0,
      processingInfo: { processingStatus: 'REFUNDED' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    // refundedAmount 75.0 → 7500
    expect(result.amountRefunded).toBe(7500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CHARGEBACK transaction to status "disputed"', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-005',
      amount: 200.0,
      currency: 'GBP',
      processingInfo: { processingStatus: 'CHARGEBACK' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('treats AUTH_ONLY as not captured', () => {
    const raw: RawBluesnapTransaction = {
      transactionId: 'TXN-006',
      amount: 30.0,
      currency: 'USD',
      cardTransactionType: 'AUTH_ONLY',
      processingInfo: { processingStatus: 'SUCCESS' },
    }
    const result = transformCharge(raw)
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back id to merchantTransactionId when transactionId is absent', () => {
    const raw: RawBluesnapTransaction = {
      merchantTransactionId: 'MERCHANT-TXN-007',
      amount: 10.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('MERCHANT-TXN-007')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
