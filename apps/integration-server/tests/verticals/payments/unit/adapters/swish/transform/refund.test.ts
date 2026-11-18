import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSwishRefund,
} from '../../../../../../../src/verticals/payments/adapters/swish/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

function makeRaw(overrides: RawSwishRefund = {}): RawSwishRefund {
  return {
    id: 're-001',
    originalPaymentReference: 'pay-001',
    amount: 10.0,
    currency: 'SEK',
    status: 'SUCCESS',
    dateCreated: '2026-01-20T12:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (swish)', () => {
  it('maps id from raw id', () => {
    expect(transformRefund(makeRaw()).id).toBe('re-001')
  })

  it('maps chargeId from originalPaymentReference', () => {
    expect(transformRefund(makeRaw()).chargeId).toBe('pay-001')
  })

  it('chargeId is empty string when originalPaymentReference is absent', () => {
    expect(transformRefund(makeRaw({ originalPaymentReference: undefined })).chargeId).toBe('')
  })

  it('converts amount to minor units (10.00 → 1000)', () => {
    expect(transformRefund(makeRaw({ amount: 10.0 })).amount).toBe(1000)
  })

  it('defaults currency to SEK when missing', () => {
    expect(transformRefund(makeRaw({ currency: undefined })).currency).toBe('SEK')
  })

  it('sets gateway to swish', () => {
    expect(transformRefund(makeRaw()).gateway).toBe('swish')
  })

  describe('status mapping', () => {
    it.each([
      ['SUCCESS', 'succeeded'],
      ['SUCCESSFUL', 'succeeded'],
      ['COMPLETED', 'succeeded'],
      ['PROCESSED', 'succeeded'],
      ['SUCCEEDED', 'succeeded'],
    ])('%s → succeeded', (raw, expected) => {
      expect(transformRefund(makeRaw({ status: raw })).status).toBe(expected)
    })

    it('FAILED → failed', () => {
      expect(transformRefund(makeRaw({ status: 'FAILED' })).status).toBe('failed')
    })

    it('unknown status → pending', () => {
      expect(transformRefund(makeRaw({ status: 'IN_REVIEW' })).status).toBe('pending')
    })

    it('missing status → pending', () => {
      expect(transformRefund(makeRaw({ status: undefined })).status).toBe('pending')
    })
  })

  it('passes schema validation', () => {
    const result = RefundSchema.safeParse(transformRefund(makeRaw()))
    expect(result.success).toBe(true)
  })
})
