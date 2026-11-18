import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type TabbyRefundContext,
} from '../../../../../../../src/verticals/payments/adapters/tabby/transform/refund'
import type { RawTabbyRefundEntry } from '../../../../../../../src/verticals/payments/adapters/tabby/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const defaultCtx: TabbyRefundContext = { paymentId: 'pay-001', currency: 'AED' }

function makeRaw(overrides: Partial<RawTabbyRefundEntry> = {}): RawTabbyRefundEntry {
  return {
    id: 'ref-001',
    amount: '50.00',
    reason: 'customer_request',
    created_at: '2026-01-20T12:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (tabby)', () => {
  it('uses raw.id as the refund id', () => {
    expect(transformRefund(makeRaw(), defaultCtx).id).toBe('ref-001')
  })

  it('falls back to reference_id when id is absent', () => {
    expect(
      transformRefund(makeRaw({ id: undefined, reference_id: 'ref-ref-001' }), defaultCtx).id,
    ).toBe('ref-ref-001')
  })

  it('maps chargeId from ctx.paymentId', () => {
    expect(transformRefund(makeRaw(), defaultCtx).chargeId).toBe('pay-001')
  })

  it('converts decimal string amount to minor units ("50.00" AED → 5000)', () => {
    expect(transformRefund(makeRaw({ amount: '50.00' }), defaultCtx).amount).toBe(5000)
  })

  it('uses ctx.currency for the conversion', () => {
    const sarCtx: TabbyRefundContext = { paymentId: 'pay-002', currency: 'SAR' }
    expect(transformRefund(makeRaw({ amount: '50.00' }), sarCtx).amount).toBe(5000)
    expect(transformRefund(makeRaw({ amount: '50.00' }), sarCtx).currency).toBe('SAR')
  })

  it('sets gateway to tabby', () => {
    expect(transformRefund(makeRaw(), defaultCtx).gateway).toBe('tabby')
  })

  it('maps createdAt from raw created_at', () => {
    expect(transformRefund(makeRaw(), defaultCtx).createdAt).toBe('2026-01-20T12:00:00.000Z')
  })

  describe('status mapping', () => {
    it('returns succeeded when raw.id is present', () => {
      expect(transformRefund(makeRaw({ id: 'ref-001' }), defaultCtx).status).toBe('succeeded')
    })

    it('returns succeeded when only reference_id is present', () => {
      expect(
        transformRefund(makeRaw({ id: undefined, reference_id: 'ref-ref-001' }), defaultCtx).status,
      ).toBe('succeeded')
    })

    it('returns pending when both id and reference_id are absent', () => {
      expect(
        transformRefund(makeRaw({ id: undefined, reference_id: undefined }), defaultCtx).status,
      ).toBe('pending')
    })
  })

  it('passes schema validation', () => {
    const result = RefundSchema.safeParse(transformRefund(makeRaw(), defaultCtx))
    expect(result.success).toBe(true)
  })
})
