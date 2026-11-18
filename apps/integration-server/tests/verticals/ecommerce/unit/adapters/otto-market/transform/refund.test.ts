/**
 * OTTO Market Return → canonical Refund.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/returns
 * The list/get endpoints and the accept/reject reason enums are confirmed;
 * the return item's own field names are not shown with a worked JSON
 * example, so `returnId` is inferred from the `<resource>Id` convention
 * `returnAddressId` confirms elsewhere (returns-warehouse) — these tests
 * cover that inference and its `id`-fallback and hard-failure paths.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawOttoReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/otto-market/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawOttoReturn> = {}): RawOttoReturn {
  return {
    returnId: 'ret-1',
    salesOrderId: 'so-1001',
    sku: 'SKU-100',
    quantity: 1,
    reason: 'RETURN_RECEIVED',
    createdDate: '2026-02-05T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('uses returnId as the id, matching the returnAddressId naming convention', () => {
    expect(transformRefund(makeReturn()).id).toBe('ret-1')
  })

  it('falls back to `id` when `returnId` is absent', () => {
    expect(transformRefund(makeReturn({ returnId: undefined, id: 'ret-2' })).id).toBe('ret-2')
  })

  it('throws rather than fabricate an id when neither returnId nor id is present', () => {
    expect(() => transformRefund(makeReturn({ returnId: undefined }))).toThrow(/id/i)
  })

  it('falls back to orderId when salesOrderId is absent', () => {
    expect(
      transformRefund(makeReturn({ salesOrderId: undefined, orderId: 'ord-77' })).orderId,
    ).toBe('ord-77')
  })

  it('throws rather than fabricate a placeholder orderId when no order reference is present', () => {
    expect(() =>
      transformRefund(makeReturn({ salesOrderId: undefined, orderId: undefined })),
    ).toThrow(/orderId/i)
  })

  it('maps sku/quantity into a single refundLineItems entry', () => {
    const result = transformRefund(makeReturn())
    expect(result.refundLineItems).toEqual([{ lineItemId: 'SKU-100', quantity: 1 }])
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeReturn()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeReturn()))).not.toThrow()
  })
})
