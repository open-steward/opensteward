import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNgeniusRefundResponse,
  type RawNgeniusRefundEntry,
} from '../../../../../../../src/verticals/payments/adapters/network-international/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('network-international transformRefund', () => {
  it('maps a SUCCESS refund entry to status "succeeded"', () => {
    const raw: RawNgeniusRefundResponse = {
      reference: 'PAY-001',
      orderReference: 'ORD-001',
      state: 'PARTIALLY_REFUNDED',
      amount: { currencyCode: 'AED', value: 5000 },
      _embedded: {
        'cnp:refund': [
          {
            reference: 'REF-001',
            state: 'SUCCESS',
            amount: { currencyCode: 'AED', value: 2500 },
            createdTime: '2024-03-01T00:00:00Z',
            updatedTime: '2024-03-01T00:00:00Z',
          } as RawNgeniusRefundEntry,
        ],
      },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
    expect(result.chargeId).toBe('ORD-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('AED')
    expect(result.gateway).toBe('network-international')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses the latest (last) embedded refund entry when multiple exist', () => {
    const raw: RawNgeniusRefundResponse = {
      reference: 'PAY-002',
      orderReference: 'ORD-002',
      _embedded: {
        'cnp:refund': [
          {
            reference: 'REF-FIRST',
            _id: 'id-first',
            state: 'SUCCESS',
            amount: { currencyCode: 'USD', value: 1000 },
          } as RawNgeniusRefundEntry,
          {
            reference: 'REF-LATEST',
            _id: 'id-latest',
            state: 'SUCCESS',
            amount: { currencyCode: 'USD', value: 500 },
          } as RawNgeniusRefundEntry,
        ],
      },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REF-LATEST')
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED refund entry to status "failed"', () => {
    const raw: RawNgeniusRefundResponse = {
      reference: 'PAY-003',
      orderReference: 'ORD-003',
      _embedded: {
        'cnp:refund': [
          {
            _id: 'refid-003',
            state: 'FAILED',
            amount: { currencyCode: 'AED', value: 1000 },
          } as RawNgeniusRefundEntry,
        ],
      },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('refid-003')
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to payment-level amount and reference when no embedded refund exists', () => {
    const raw: RawNgeniusRefundResponse = {
      reference: 'PAY-004',
      orderReference: 'ORD-004',
      state: 'REFUNDED',
      amount: { currencyCode: 'EUR', value: 800 },
      updateDateTime: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('PAY-004')
    expect(result.chargeId).toBe('ORD-004')
    expect(result.amount).toBe(800)
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED refund entry to status "cancelled"', () => {
    const raw: RawNgeniusRefundResponse = {
      _id: 'pay-id-005',
      reference: 'PAY-005',
      orderReference: 'ORD-005',
      _embedded: {
        'cnp:refund': [
          {
            reference: 'REF-005',
            state: 'CANCELLED',
            amount: { currencyCode: 'AED', value: 300 },
          } as RawNgeniusRefundEntry,
        ],
      },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
