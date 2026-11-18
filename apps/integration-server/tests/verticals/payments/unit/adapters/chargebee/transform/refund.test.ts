import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawChargebeeRefund,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const baseRaw: RawChargebeeRefund = {
  id: 'txn_refund_001',
  type: 'refund',
  status: 'success',
  amount: 2000,
  currency_code: 'USD',
  customer_id: 'cust_123',
  subscription_id: 'sub_xyz',
  invoice_id: 'inv_456',
  gateway: 'stripe',
  reference_number: 'ref_stripe_001',
  date: 1709251200, // 2024-03-01T00:00:00Z
  linked_refunds: [{ txn_id: 'txn_payment_001', applied_amount: 2000 }],
}

describe('chargebee transformRefund', () => {
  it('maps status "success" to "succeeded"', () => {
    const result = transformRefund(baseRaw)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('chargebee')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('passes through amount (already in minor units) and currency', () => {
    const result = transformRefund(baseRaw)
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('resolves chargeId from linked_refunds[0].txn_id', () => {
    const result = transformRefund(baseRaw)
    expect(result.chargeId).toBe('txn_payment_001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty chargeId when linked_refunds is absent', () => {
    const raw: RawChargebeeRefund = { ...baseRaw, linked_refunds: undefined }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failure" to "failed"', () => {
    const result = transformRefund({ ...baseRaw, status: 'failure' })
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "voided" to "cancelled"', () => {
    const result = transformRefund({ ...baseRaw, status: 'voided' })
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second date to ISO string', () => {
    const result = transformRefund(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
