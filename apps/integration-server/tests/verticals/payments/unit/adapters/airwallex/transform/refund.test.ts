import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAirwallexRefund,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('airwallex transformRefund', () => {
  it('maps status "SUCCEEDED" to "succeeded" and scales major-unit amount to minor units', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-001',
      payment_intent_id: 'int-001',
      amount: 25.0,
      currency: 'usd',
      status: 'SUCCEEDED',
      acquirer_reference_number: 'ARN-001',
      created_at: '2024-03-05T10:00:00+0000',
      updated_at: '2024-03-05T10:00:00+0000',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.chargeId).toBe('int-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.receiptNumber).toBe('ARN-001')
    expect(result.gateway).toBe('airwallex')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "SETTLED" to "succeeded"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-002',
      payment_intent_id: 'int-002',
      amount: 10.0,
      currency: 'EUR',
      status: 'SETTLED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "FAILED" to "failed"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-003',
      payment_intent_id: 'int-003',
      amount: 15.0,
      currency: 'GBP',
      status: 'FAILED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "PENDING" to "pending"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-004',
      payment_intent_id: 'int-004',
      amount: 5.0,
      currency: 'AUD',
      status: 'PENDING',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "RECEIVED" to "pending"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-005',
      payment_intent_id: 'int-005',
      amount: 8.0,
      currency: 'USD',
      status: 'RECEIVED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason containing "duplicate" to "duplicate"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-006',
      payment_intent_id: 'int-006',
      amount: 20.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      reason: 'duplicate charge',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason containing "fraud" to "fraudulent"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-007',
      payment_intent_id: 'int-007',
      amount: 20.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      reason: 'fraudulent transaction',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps reason containing "customer" to "requested_by_customer"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-008',
      payment_intent_id: 'int-008',
      amount: 20.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      reason: 'customer requested',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('requested_by_customer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "CANCELLED" to "cancelled"', () => {
    const raw: RawAirwallexRefund = {
      id: 'ref-009',
      payment_intent_id: 'int-009',
      amount: 10.0,
      currency: 'USD',
      status: 'CANCELLED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
