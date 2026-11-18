import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPaymobTransaction,
} from '../../../../../../../src/verticals/payments/adapters/paymob/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paymob transformCharge', () => {
  it('maps a successful, captured transaction to status "succeeded"', () => {
    const raw: RawPaymobTransaction = {
      id: 987654,
      amount_cents: 5000,
      currency: 'EGP',
      success: true,
      pending: false,
      is_voided: false,
      is_refunded: false,
      is_auth: false,
      is_captured: false,
      error_occured: false,
      order: {
        id: 111,
        merchant_order_id: 'ORD-001',
        amount_cents: 5000,
        currency: 'EGP',
      },
      billing_data: {
        email: 'buyer@example.com',
        first_name: 'Alice',
        last_name: 'Smith',
      },
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.id).toBe('987654')
    expect(result.externalId).toBe('ORD-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EGP')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paymob')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.customerId).toBe('111')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided transaction to status "cancelled"', () => {
    const raw: RawPaymobTransaction = {
      id: 123,
      amount_cents: 1000,
      currency: 'EGP',
      success: false,
      pending: false,
      is_voided: true,
      is_refunded: false,
      error_occured: false,
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(result.amount).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refunded transaction to status "refunded"', () => {
    const raw: RawPaymobTransaction = {
      id: 456,
      amount_cents: 2000,
      currency: 'EGP',
      success: false,
      pending: false,
      is_voided: false,
      is_refunded: true,
      error_occured: false,
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an auth-only (not yet captured) successful transaction to status "pending"', () => {
    const raw: RawPaymobTransaction = {
      id: 789,
      amount_cents: 3000,
      currency: 'EGP',
      success: true,
      pending: false,
      is_auth: true,
      is_captured: false,
      is_capture: false,
      is_voided: false,
      is_refunded: false,
      error_occured: false,
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an error transaction to status "failed"', () => {
    const raw: RawPaymobTransaction = {
      id: 321,
      amount_cents: 500,
      currency: 'EGP',
      success: false,
      pending: false,
      is_voided: false,
      is_refunded: false,
      error_occured: true,
      data: { message: 'Card declined', txn_response_code: 'DECLINED' },
      created_at: '2024-03-01T00:00:00Z',
    }

    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
