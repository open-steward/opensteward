import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawAfterpayDispute,
} from '../../../../../../../src/verticals/payments/adapters/afterpay/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('afterpay transformDispute', () => {
  it('maps status "needs_response" and reason "fraudulent" correctly', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-001',
      order: 'ap-pay-001',
      amount: '49.99',
      currency: 'USD',
      status: 'needs_response',
      reason: 'fraudulent',
      open: true,
      responseDueBy: '2024-04-01T00:00:00Z',
      createdAt: '2024-03-01T12:00:00Z',
      updatedAt: '2024-03-01T12:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('ap-disp-001')
    expect(result.chargeId).toBe('ap-pay-001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('afterpay')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "won" correctly', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-002',
      order: 'ap-pay-002',
      amount: '25.00',
      currency: 'AUD',
      status: 'won',
      reason: 'product_not_received',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('product_not_received')
    expect(result.currency).toBe('AUD')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "lost" correctly', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-003',
      order: 'ap-pay-003',
      amount: '10.00',
      currency: 'GBP',
      status: 'lost',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "merchant_refunded" to "charge_refunded"', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-004',
      order: 'ap-pay-004',
      amount: '30.00',
      currency: 'USD',
      status: 'merchant_refunded',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps status "merchant_voided" to "warning_closed"', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-005',
      order: 'ap-pay-005',
      amount: '15.00',
      currency: 'CAD',
      status: 'merchant_voided',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('warning_closed')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('defaults to "under_review" for unrecognised status', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-006',
      order: 'ap-pay-006',
      amount: '20.00',
      currency: 'USD',
      status: 'some_unknown_status',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('handles epoch-ms number for responseDueBy', () => {
    const epochMs = 1711929600000 // 2024-04-01T00:00:00.000Z
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-007',
      order: 'ap-pay-007',
      amount: '10.00',
      currency: 'USD',
      status: 'needs_response',
      responseDueBy: epochMs,
    }
    const result = transformDispute(raw)
    expect(result.evidenceDueBy).toBe(new Date(epochMs).toISOString())
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps network from meta.network', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-008',
      order: 'ap-pay-008',
      amount: '10.00',
      currency: 'USD',
      status: 'under_review',
      meta: { network: 'visa' },
    }
    const result = transformDispute(raw)
    expect(result.network).toBe('visa')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('falls back chargeId to merchantOrderId when order is absent', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-009',
      merchantOrderId: 'merch-ord-009',
      amount: '10.00',
      currency: 'USD',
      status: 'under_review',
    }
    const result = transformDispute(raw)
    expect(result.chargeId).toBe('merch-ord-009')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps reason "duplicate" correctly', () => {
    const raw: RawAfterpayDispute = {
      id: 'ap-disp-010',
      order: 'ap-pay-010',
      amount: '50.00',
      currency: 'USD',
      status: 'needs_response',
      reason: 'duplicate',
    }
    const result = transformDispute(raw)
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
