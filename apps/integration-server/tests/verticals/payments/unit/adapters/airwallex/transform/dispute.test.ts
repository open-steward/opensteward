import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawAirwallexDispute,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('airwallex transformDispute', () => {
  it('maps status "REQUIRES_RESPONSE" to "needs_response" with fraudulent reason', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-001',
      payment_intent_id: 'int-001',
      amount: 49.99,
      currency: 'usd',
      status: 'REQUIRES_RESPONSE',
      reason: { type: 'FRAUDULENT', description: 'Fraud chargeback' },
      due_at: '2024-04-01T00:00:00+0000',
      card_brand: 'visa',
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('disp-001')
    expect(result.chargeId).toBe('int-001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.network).toBe('visa')
    expect(result.gateway).toBe('airwallex')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "WON" to "won"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-002',
      payment_intent_id: 'int-002',
      amount: 20.0,
      currency: 'EUR',
      status: 'WON',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "LOST" to "lost"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-003',
      payment_intent_id: 'int-003',
      amount: 15.0,
      currency: 'GBP',
      status: 'LOST',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "ACCEPTED" to "charge_refunded"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-004',
      payment_intent_id: 'int-004',
      amount: 30.0,
      currency: 'USD',
      status: 'ACCEPTED',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "UNDER_REVIEW" to "under_review"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-005',
      payment_intent_id: 'int-005',
      amount: 10.0,
      currency: 'AUD',
      status: 'UNDER_REVIEW',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps PRE_CHARGEBACK stage + REQUIRES_RESPONSE to "warning_needs_response"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-006',
      payment_intent_id: 'int-006',
      amount: 25.0,
      currency: 'USD',
      status: 'REQUIRES_RESPONSE',
      stage: 'PRE_CHARGEBACK',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason string containing "DUPLICATE" to "duplicate"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-007',
      payment_intent_id: 'int-007',
      amount: 10.0,
      currency: 'USD',
      status: 'REQUIRES_RESPONSE',
      reason: 'DUPLICATE',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason containing "NOT_RECEIVED" to "product_not_received"', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-008',
      payment_intent_id: 'int-008',
      amount: 10.0,
      currency: 'USD',
      status: 'REQUIRES_RESPONSE',
      reason: { type: 'PRODUCT_NOT_RECEIVED' },
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back currency to USD when absent', () => {
    const raw: RawAirwallexDispute = {
      id: 'disp-009',
      payment_intent_id: 'int-009',
      amount: 10.0,
      status: 'WON',
    }
    const result = transformDispute(raw)
    expect(result.currency).toBe('USD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
