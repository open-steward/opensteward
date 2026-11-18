/**
 * Marketplacer RefundRequest → Refund transform.
 * Docs: https://api.marketplacer.com/docs/seller-api/reference/queries/refundrequests/
 *       https://api.marketplacer.com/docs/seller-api/reference/mutations/refundrequestcreate/
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawMarketplacerRefundRequest,
} from '../../../../../../../src/verticals/ecommerce/adapters/marketplacer/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefundRequest(overrides: Partial<RawMarketplacerRefundRequest> = {}): RawMarketplacerRefundRequest {
  return {
    id: 'UmVmdW5kUmVxdWVzdC0yMA==',
    status: 'AWAITING',
    invoice: { id: 'SW52b2ljZS0xMDAxOA==' },
    lineItems: [{ id: 'UmVmdW5kUmVxdWVzdExpbmVJdGVtLTE2', reason: 'Cracked Screen' }],
    ...overrides,
  }
}

describe('transformRefund (Marketplacer refund request)', () => {
  it('maps id/orderId/reason', () => {
    const result = transformRefund(makeRefundRequest())
    expect(result.id).toBe('UmVmdW5kUmVxdWVzdC0yMA==')
    expect(result.orderId).toBe('SW52b2ljZS0xMDAxOA==')
    expect(result.reason).toBe('Cracked Screen')
  })

  it('leaves reason undefined when no line item reports one', () => {
    const result = transformRefund(makeRefundRequest({ lineItems: [{ id: 'li1' }] }))
    expect(result.reason).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRefundRequest()
    expect(transformRefund(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRefundRequest()))).not.toThrow()
  })
})

describe('untransformRefund (Marketplacer refundRequestCreate input)', () => {
  it('builds the mutation input from orderId + refundLineItems', () => {
    const input = untransformRefund({
      orderId: 'SW52b2ljZS0xMDAxOA==',
      reason: 'Cracked Screen',
      note: 'High value item, requires return',
      refundLineItems: [{ lineItemId: 'TGluZUl0ZW0tMTk=', quantity: 1 }],
    })
    expect(input).toEqual({
      invoiceId: 'SW52b2ljZS0xMDAxOA==',
      lineItems: [{ lineItemId: 'TGluZUl0ZW0tMTk=', quantity: 1, reason: 'Cracked Screen' }],
      notes: [{ note: 'High value item, requires return' }],
    })
  })

  it('throws without orderId', () => {
    expect(() => untransformRefund({ refundLineItems: [{ lineItemId: 'li1', quantity: 1 }] })).toThrow(
      /requires orderId/,
    )
  })

  it('throws without at least one refundLineItems entry, rather than sending an empty mutation', () => {
    expect(() => untransformRefund({ orderId: 'inv1', refundLineItems: [] })).toThrow(
      /at least one refundLineItems/,
    )
  })
})
