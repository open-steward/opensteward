import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawVippsRefundResponse,
  type VippsRefundContext,
} from '../../../../../../../src/verticals/payments/adapters/vipps-mobilepay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('vipps-mobilepay transformRefund', () => {
  it('maps a refund using pspReference as id and reference as chargeId', () => {
    const raw: RawVippsRefundResponse = {
      reference: 'REF-001',
      pspReference: 'PSP-001',
      state: 'REFUNDED',
      aggregate: {
        refundedAmount: { value: 5000, currency: 'NOK' },
      },
    }
    const ctx: VippsRefundContext = {
      reference: 'REF-001',
    }
    const result = transformRefund(raw, ctx)
    expect(result.id).toBe('PSP-001')
    expect(result.externalId).toBe('PSP-001')
    expect(result.chargeId).toBe('REF-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('NOK')
    expect(result.gateway).toBe('vipps-mobilepay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('prefers modificationAmount from context over aggregate refundedAmount', () => {
    const raw: RawVippsRefundResponse = {
      reference: 'REF-002',
      pspReference: 'PSP-002',
      state: 'REFUNDED',
      aggregate: {
        refundedAmount: { value: 10000, currency: 'NOK' },
      },
    }
    const ctx: VippsRefundContext = {
      reference: 'REF-002',
      modificationAmount: { value: 3000, currency: 'NOK' },
    }
    const result = transformRefund(raw, ctx)
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('NOK')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to context reference for chargeId when raw.reference is missing', () => {
    const raw: RawVippsRefundResponse = {
      pspReference: 'PSP-003',
      state: 'REFUNDED',
      aggregate: {
        refundedAmount: { value: 2000, currency: 'EUR' },
      },
    }
    const ctx: VippsRefundContext = {
      reference: 'CHARGE-XYZ',
      modificationAmount: { value: 2000, currency: 'EUR' },
    }
    const result = transformRefund(raw, ctx)
    expect(result.chargeId).toBe('CHARGE-XYZ')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('always sets status to "succeeded"', () => {
    const raw: RawVippsRefundResponse = {
      reference: 'REF-004',
      pspReference: 'PSP-004',
      state: 'PENDING',
      aggregate: {
        refundedAmount: { value: 1500, currency: 'NOK' },
      },
    }
    const ctx: VippsRefundContext = {
      reference: 'REF-004',
    }
    const result = transformRefund(raw, ctx)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('includes pspReference and state in metadata', () => {
    const raw: RawVippsRefundResponse = {
      reference: 'REF-005',
      pspReference: 'PSP-005',
      state: 'REFUNDED',
      aggregate: {
        refundedAmount: { value: 800, currency: 'NOK' },
      },
    }
    const ctx: VippsRefundContext = {
      reference: 'REF-005',
    }
    const result = transformRefund(raw, ctx)
    expect(result.metadata?.['pspReference']).toBe('PSP-005')
    expect(result.metadata?.['state']).toBe('REFUNDED')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
