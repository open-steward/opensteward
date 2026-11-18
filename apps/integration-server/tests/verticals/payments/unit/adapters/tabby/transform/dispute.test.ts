import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawTabbyDispute,
} from '../../../../../../../src/verticals/payments/adapters/tabby/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

function makeRaw(overrides: Partial<RawTabbyDispute> = {}): RawTabbyDispute {
  return {
    id: 'disp-001',
    payment_id: 'pay-001',
    amount: '100.00',
    currency: 'AED',
    status: 'new',
    reason: 'not_delivered',
    created_at: '2026-01-15T09:30:00Z',
    expired_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDispute (tabby)', () => {
  it('maps id from raw id', () => {
    expect(transformDispute(makeRaw()).id).toBe('disp-001')
  })

  it('maps chargeId from payment_id', () => {
    expect(transformDispute(makeRaw()).chargeId).toBe('pay-001')
  })

  it('converts decimal string amount to minor units ("100.00" AED → 10000)', () => {
    expect(transformDispute(makeRaw({ amount: '100.00', currency: 'AED' })).amount).toBe(10000)
  })

  it('defaults currency to AED when missing', () => {
    expect(transformDispute(makeRaw({ currency: undefined })).currency).toBe('AED')
  })

  it('sets gateway to tabby', () => {
    expect(transformDispute(makeRaw()).gateway).toBe('tabby')
  })

  it('maps evidenceDueBy from expired_at', () => {
    expect(transformDispute(makeRaw()).evidenceDueBy).toBe('2026-02-01T00:00:00.000Z')
  })

  describe('status mapping', () => {
    it.each([
      ['new', 'needs_response'],
      ['evidence_merchant', 'needs_response'],
    ])('%s → needs_response', (raw, expected) => {
      expect(transformDispute(makeRaw({ status: raw })).status).toBe(expected)
    })

    it.each([
      ['evidence_customer', 'under_review'],
      ['in_progress', 'under_review'],
    ])('%s → under_review', (raw, expected) => {
      expect(transformDispute(makeRaw({ status: raw })).status).toBe(expected)
    })

    it('refunded → charge_refunded', () => {
      expect(transformDispute(makeRaw({ status: 'refunded' })).status).toBe('charge_refunded')
    })

    it('declined → lost', () => {
      expect(transformDispute(makeRaw({ status: 'declined' })).status).toBe('lost')
    })

    it('cancelled → warning_closed', () => {
      expect(transformDispute(makeRaw({ status: 'cancelled' })).status).toBe('warning_closed')
    })

    it('unknown status → under_review (default)', () => {
      expect(transformDispute(makeRaw({ status: 'unknown_state' })).status).toBe('under_review')
    })
  })

  describe('reason mapping', () => {
    it('unreceived_refund → credit_not_processed', () => {
      expect(transformDispute(makeRaw({ reason: 'unreceived_refund' })).reason).toBe(
        'credit_not_processed',
      )
    })

    it('identity_theft → fraudulent', () => {
      expect(transformDispute(makeRaw({ reason: 'identity_theft' })).reason).toBe('fraudulent')
    })

    it('product_issue → product_unacceptable', () => {
      expect(transformDispute(makeRaw({ reason: 'product_issue' })).reason).toBe(
        'product_unacceptable',
      )
    })

    it('not_delivered → product_not_received', () => {
      expect(transformDispute(makeRaw({ reason: 'not_delivered' })).reason).toBe(
        'product_not_received',
      )
    })

    it('unknown reason → undefined', () => {
      expect(transformDispute(makeRaw({ reason: 'other_reason' })).reason).toBeUndefined()
    })
  })

  it('passes schema validation', () => {
    const result = DisputeSchema.safeParse(transformDispute(makeRaw()))
    expect(result.success).toBe(true)
  })
})
