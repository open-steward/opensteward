import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  untransformCharge,
  type RawCellulantRequest,
} from '../../../../../../../src/verticals/payments/adapters/cellulant/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const baseRaw: RawCellulantRequest = {
  checkout_request_id: 'CRQ-001',
  merchant_transaction_id: 'MTX-001',
  request_amount: '100.00',
  currency_code: 'KES',
  request_status_code: 178, // full payment received → succeeded
  request_status_description: 'Payment received',
  customer_email: 'buyer@example.com',
  account_number: 'ACC-123',
  date_created: '2024-03-01 00:00:00',
  date_modified: '2024-03-01 00:00:00',
}

describe('cellulant transformCharge', () => {
  it('maps status_code 178 to "succeeded"', () => {
    const result = transformCharge(baseRaw)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cellulant')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('converts major-unit amount (100.00) to minor units (10000)', () => {
    const result = transformCharge(baseRaw)
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('KES')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status_code 101 (created) to "pending"', () => {
    const result = transformCharge({ ...baseRaw, request_status_code: 101 })
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status_code 99 (failed) to "failed"', () => {
    const result = transformCharge({ ...baseRaw, request_status_code: 99 })
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces customer email and account number', () => {
    const result = transformCharge(baseRaw)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.customerId).toBe('ACC-123')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformCharge and back', () => {
    const forward = transformCharge(baseRaw)
    const untransformed = untransformCharge(forward)
    // The untransformed body should carry back the key request fields.
    expect(untransformed.merchant_transaction_id).toBe(forward.externalId)
    // Amount is converted back from minor units to major-unit string.
    expect(Number(untransformed.request_amount)).toBeCloseTo(forward.amount / 100, 2)
    expect(untransformed.currency_code).toBe(forward.currency.toUpperCase())
  })
})
