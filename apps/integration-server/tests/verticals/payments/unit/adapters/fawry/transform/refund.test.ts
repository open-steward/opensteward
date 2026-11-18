import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawFawryRefundResponse,
  type RefundHint,
} from '../../../../../../../src/verticals/payments/adapters/fawry/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('fawry transformRefund', () => {
  it('maps statusCode 200 to status "succeeded"', () => {
    const raw: RawFawryRefundResponse = {
      type: 'ResponseDataModel',
      statusCode: 200,
      statusDescription: 'Operation done successfully',
    }
    const hint: RefundHint = {
      chargeId: 'REF-001',
      amount: 1000,
      currency: 'EGP',
      reason: 'customer_request',
    }
    const result = transformRefund(raw, hint)
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('REF-001')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EGP')
    expect(result.gateway).toBe('fawry')
    expect(result.failureReason).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps non-200 statusCode to status "failed" with failure reason', () => {
    const raw: RawFawryRefundResponse = {
      type: 'ResponseDataModel',
      statusCode: 9901,
      statusDescription: 'Invalid merchant reference',
    }
    const hint: RefundHint = {
      chargeId: 'REF-002',
      amount: 500,
      currency: 'EGP',
    }
    const result = transformRefund(raw, hint)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Invalid merchant reference')
    expect(result.chargeId).toBe('REF-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles string "200" statusCode as succeeded', () => {
    const raw: RawFawryRefundResponse = {
      statusCode: '200',
      statusDescription: 'OK',
    }
    const hint: RefundHint = { chargeId: 'REF-003', amount: 200, currency: 'EGP' }
    const result = transformRefund(raw, hint)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults amount to 0 and currency to EGP when hint is empty', () => {
    const raw: RawFawryRefundResponse = { statusCode: 200 }
    const result = transformRefund(raw)
    expect(result.amount).toBe(0)
    expect(result.currency).toBe('EGP')
    expect(result.id).toBe('')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('stores reason and statusCode in metadata', () => {
    const raw: RawFawryRefundResponse = {
      statusCode: 200,
      statusDescription: 'Done',
    }
    const hint: RefundHint = {
      chargeId: 'REF-004',
      amount: 750,
      currency: 'EGP',
      reason: 'duplicate',
    }
    const result = transformRefund(raw, hint)
    expect(result.metadata['reason']).toBe('duplicate')
    expect(result.metadata['statusCode']).toBe('200')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
