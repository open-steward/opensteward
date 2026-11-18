/**
 * FastSpring Return transform tests.
 *
 * Raw shape per https://developer.fastspring.com/reference/retrieve-a-return
 * and https://developer.fastspring.com/reference/create-a-return.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawFastSpringReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/fastspring/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawFastSpringReturn> = {}): RawFastSpringReturn {
  return {
    return: 'aBCDE12fGH3iJkL4mNOpqr',
    reference: 'ABC1234567-8910-11121D',
    changed: 1731381500223,
    account: 'abCdE1FGH2Hij3KLMnOpqR',
    currency: 'USD',
    totalReturn: 10,
    reason: 'DUPLICATE_ORDER',
    note: 'As requested by customer',
    original: { id: 'AbC1D2eFGH34ijklmnopQrs', order: 'AbC1D2eFGH34ijklmnopQrs' },
    ...overrides,
  }
}

describe('FastSpring transform/refund', () => {
  it('maps a full return and survives RefundSchema.parse', () => {
    const refund = transformRefund(makeReturn())
    expect(RefundSchema.parse(refund)).toBeTruthy()
    expect(refund.id).toBe('aBCDE12fGH3iJkL4mNOpqr')
    expect(refund.orderId).toBe('AbC1D2eFGH34ijklmnopQrs')
    expect(refund.reason).toBe('DUPLICATE_ORDER')
  })

  it('converts the decimal totalReturn to integer minor units', () => {
    const refund = transformRefund(makeReturn({ totalReturn: 5.5 }))
    RefundSchema.parse(refund)
    expect(refund.amount).toEqual({ amount: 550, currency: 'USD' })
  })

  it('maps partial-refund line items with absolute quantities', () => {
    const refund = transformRefund(
      makeReturn({ items: [{ product: 'furious-falcon', quantity: 0, subtotal: 5 }] }),
    )
    RefundSchema.parse(refund)
    expect(refund.refundLineItems).toEqual([
      { lineItemId: 'furious-falcon', quantity: 0, amount: { amount: 500, currency: 'USD' } },
    ])
  })

  it('never sets restock (no such concept for digital goods)', () => {
    const refund = transformRefund(makeReturn())
    expect(refund.restock).toBeUndefined()
  })

  it('converts the `changed` epoch-ms timestamp to ISO 8601', () => {
    const refund = transformRefund(makeReturn({ changed: 1731381500223 }))
    expect(refund.createdAt).toBe(new Date(1731381500223).toISOString())
    expect(refund.processedAt).toBe(refund.createdAt)
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeReturn()
    const refund = transformRefund(raw)
    expect(refund.metadata).toEqual(raw)
  })

  it('untransformRefund builds a FULL return body when there are no line items', () => {
    const refund = transformRefund(makeReturn())
    const body = untransformRefund(refund)
    expect(body).toMatchObject({
      order: 'AbC1D2eFGH34ijklmnopQrs',
      reason: 'DUPLICATE_ORDER',
      refundType: 'FULL',
    })
    expect(body['items']).toBeUndefined()
  })

  it('untransformRefund builds a PARTIAL return body when line items are present', () => {
    const refund = transformRefund(
      makeReturn({ items: [{ product: 'furious-falcon', quantity: 1, subtotal: 5 }] }),
    )
    const body = untransformRefund(refund)
    expect(body['refundType']).toBe('PARTIAL')
    expect(body['items']).toEqual([{ product: 'furious-falcon', amount: 5 }])
  })
})
