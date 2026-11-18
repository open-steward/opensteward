import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawChargebeeTransaction,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const baseRaw: RawChargebeeTransaction = {
  id: 'txn_001',
  type: 'payment',
  status: 'success',
  amount: 4999,
  currency_code: 'USD',
  customer_id: 'cust_123',
  payment_source_id: 'pm_abc',
  subscription_id: 'sub_xyz',
  invoice_id: 'inv_456',
  gateway: 'stripe',
  reference_number: 'pi_stripe_ref',
  date: 1709251200, // 2024-03-01T00:00:00Z
}

describe('chargebee transformCharge', () => {
  it('maps status "success" (payment type) to "succeeded"', () => {
    const result = transformCharge(baseRaw)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('chargebee')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('passes through amount (already in minor units) and currency', () => {
    const result = transformCharge(baseRaw)
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "success" + type "refund" to "refunded"', () => {
    const result = transformCharge({ ...baseRaw, type: 'refund' })
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "failure" to "failed"', () => {
    const result = transformCharge({ ...baseRaw, status: 'failure' })
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "voided" to "cancelled"', () => {
    const result = transformCharge({ ...baseRaw, status: 'voided' })
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces customerId, subscriptionId, and invoiceId', () => {
    const result = transformCharge(baseRaw)
    expect(result.customerId).toBe('cust_123')
    expect(result.subscriptionId).toBe('sub_xyz')
    expect(result.invoiceId).toBe('inv_456')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second date to ISO string', () => {
    const result = transformCharge(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
