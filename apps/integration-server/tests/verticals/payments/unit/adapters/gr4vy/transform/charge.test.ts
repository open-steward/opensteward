import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawGr4vyTransaction,
} from '../../../../../../../src/verticals/payments/adapters/gr4vy/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('gr4vy transformCharge', () => {
  it('maps a capture_succeeded transaction to status "succeeded"', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-001',
      status: 'capture_succeeded',
      amount: 10000,
      captured_amount: 10000,
      refunded_amount: 0,
      currency: 'USD',
      buyer: { id: 'buyer-001', display_name: 'Jane Doe' },
      payment_method: { id: 'pm-001', method: 'card', scheme: 'visa', label: '4242' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('buyer-001')
    expect(result.paymentMethodId).toBe('pm-001')
    expect(result.gateway).toBe('gr4vy')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a disputed transaction to status "disputed"', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-002',
      status: 'capture_succeeded',
      amount: 5000,
      currency: 'EUR',
      disputed: true,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially_refunded transaction when refunded < captured', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-003',
      status: 'capture_succeeded',
      amount: 10000,
      captured_amount: 10000,
      refunded_amount: 3000,
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(result.amountCaptured).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a fully refunded transaction when refunded >= captured', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-004',
      status: 'capture_succeeded',
      amount: 8000,
      captured_amount: 8000,
      refunded_amount: 8000,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorization_declined transaction to status "failed"', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-005',
      status: 'authorization_declined',
      amount: 2000,
      currency: 'AUD',
      error_code: 'declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorization_voided transaction to status "cancelled"', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-006',
      status: 'authorization_voided',
      amount: 1500,
      currency: 'CAD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses external_identifier as externalId when provided', () => {
    const raw: RawGr4vyTransaction = {
      id: 'txn-007',
      external_identifier: 'ext-ref-007',
      status: 'capture_succeeded',
      amount: 500,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.externalId).toBe('ext-ref-007')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
