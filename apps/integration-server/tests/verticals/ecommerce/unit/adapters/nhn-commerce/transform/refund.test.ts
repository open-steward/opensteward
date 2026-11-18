import { describe, it, expect } from 'vitest'
import {
  transformClaim,
  untransformRefund,
  type RawNhnClaimItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawNhnClaimItem> = {}): RawNhnClaimItem {
  return {
    claimNo: 77001,
    orderNo: 'ORD20240301001',
    orderOptionNo: 10001,
    claimType: 'CANCEL',
    claimReasonType: 'CHANGE_MIND',
    claimReasonDetail: '단순 변심',
    claimStatusType: 'CANCEL_DONE',
    refundAmt: 50000,
    registerYmdt: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('transformClaim (NHN Commerce)', () => {
  it('maps claimNo to string canonical id', () => {
    const result = transformClaim(makeRaw())
    expect(result.id).toBe('77001')
  })

  it('maps orderNo to orderId', () => {
    const result = transformClaim(makeRaw())
    expect(result.orderId).toBe('ORD20240301001')
  })

  it('converts refundAmt to minor units (KRW stays 1:1)', () => {
    const result = transformClaim(makeRaw())
    expect(result.amount).toEqual({ amount: 50000, currency: 'KRW' })
  })

  it('prefers claimReasonDetail as reason', () => {
    const result = transformClaim(makeRaw())
    expect(result.reason).toBe('단순 변심')
  })

  it('falls back to claimReasonType when detail is absent', () => {
    const result = transformClaim(makeRaw({ claimReasonDetail: null }))
    expect(result.reason).toBe('CHANGE_MIND')
  })

  it('synthesises refundLineItem from orderOptionNo', () => {
    const result = transformClaim(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('10001')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
  })

  it('maps registerYmdt to processedAt and createdAt as ISO strings', () => {
    const result = transformClaim(makeRaw())
    expect(result.processedAt).toBe('2024-03-05T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('handles null refundAmt gracefully', () => {
    const result = transformClaim(makeRaw({ refundAmt: null }))
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformClaim(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (NHN Commerce)', () => {
  it('maps refundLineItems to orderOptionNos', () => {
    const refund = transformClaim(makeRaw())
    const body = untransformRefund(refund)
    expect(body['claimReasonType']).toBe('CHANGE_MIND')
    expect(body['claimReasonDetail']).toBe('단순 변심')
    const nos = body['orderOptionNos'] as string[]
    expect(nos).toEqual(['10001'])
  })
})
