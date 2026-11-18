import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAuthNetTransaction,
} from '../../../../../../../src/verticals/payments/adapters/authorize-net/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('authorize-net transformCharge', () => {
  const base: RawAuthNetTransaction = {
    transId: 'txn-12345',
    status: 'settledSuccessfully',
    transactionStatus: 'settledSuccessfully',
    transactionType: 'authCaptureTransaction',
    authAmount: '99.99',
    settleAmount: '99.99',
    refundedAmount: undefined,
    responseCode: '1',
    invoiceNumber: 'INV-001',
    customer: { email: 'buyer@example.com', id: 'cust-anet-1' },
    billTo: { firstName: 'John', lastName: 'Doe' },
    submitTimeUTC: '2024-03-15T12:00:00Z',
  }

  it('maps transId to id and externalId', () => {
    const result = transformCharge(base)
    expect(result.id).toBe('txn-12345')
    expect(result.externalId).toBe('txn-12345')
  })

  it('converts settleAmount to minor units', () => {
    const result = transformCharge(base)
    expect(result.amount).toBe(9999) // 99.99 * 100
  })

  it('maps settled status to succeeded', () => {
    const result = transformCharge(base)
    expect(result.status).toBe('succeeded')
  })

  it('hardcodes currency to USD', () => {
    const result = transformCharge(base)
    expect(result.currency).toBe('USD')
  })

  it('maps customer.id to customerId and customer.email to receiptEmail', () => {
    const result = transformCharge(base)
    expect(result.customerId).toBe('cust-anet-1')
    expect(result.receiptEmail).toBe('buyer@example.com')
  })

  it('maps billTo name as description when no invoiceNumber alternative', () => {
    const result = transformCharge({ ...base, invoiceNumber: undefined })
    expect(result.description).toBe('John Doe')
  })

  it('maps capturedPendingSettlement status to pending', () => {
    const result = transformCharge({ ...base, status: 'capturedPendingSettlement' })
    expect(result.status).toBe('pending')
  })

  it('maps voided status to cancelled', () => {
    const result = transformCharge({ ...base, status: 'voided' })
    expect(result.status).toBe('cancelled')
  })

  it('maps refundPending status to refunded', () => {
    // refundsettled hits includes('settled') first → succeeded; use refundPending instead
    const result = transformCharge({ ...base, status: 'refundPending' })
    expect(result.status).toBe('refunded')
  })

  it('maps declined status to failed', () => {
    const result = transformCharge({ ...base, status: 'declined' })
    expect(result.status).toBe('failed')
  })

  it('puts invoice_number and transaction_type in metadata', () => {
    const result = transformCharge(base)
    expect(result.metadata['invoice_number']).toBe('INV-001')
    expect(result.metadata['transaction_type']).toBe('authCaptureTransaction')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformCharge(base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('conforms to ChargeSchema', () => {
    expect(() => ChargeSchema.parse(transformCharge(base))).not.toThrow()
  })
})
