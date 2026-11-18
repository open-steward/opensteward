import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawApsRefund,
} from '../../../../../../../src/verticals/payments/adapters/amazon-payment-services/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('amazon-payment-services transformRefund', () => {
  it('maps a refund success (status 06) to succeeded', () => {
    const raw: RawApsRefund = {
      fort_id: 'RF-001',
      merchant_reference: 'MR-ORIG-001',
      original_fort_id: 'FT-ORIG-001',
      status: '06',
      amount: '5000',
      currency: 'AED',
      response_code: '06000',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('RF-001')
    expect(result.chargeId).toBe('FT-ORIG-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AED')
    expect(result.gateway).toBe('amazon-payment-services')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses maintenance_reference as id when fort_id is absent', () => {
    const raw: RawApsRefund = {
      maintenance_reference: 'MNT-001',
      merchant_reference: 'MR-001',
      status: '06',
      amount: '1500',
      currency: 'USD',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('MNT-001')
    expect(result.chargeId).toBe('MR-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund via non-success response_code', () => {
    const raw: RawApsRefund = {
      fort_id: 'RF-002',
      merchant_reference: 'MR-002',
      status: '23',
      response_code: '23001',
      response_message: 'Refund declined',
      amount: '2000',
      currency: 'EUR',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund declined')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund when no status or response_code is present', () => {
    const raw: RawApsRefund = {
      fort_id: 'RF-003',
      amount: '800',
      currency: 'GBP',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
