/**
 * Shape verified against the raw OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/returnsreturnsget (`GET
 * /returns/returns`, `returns[]`) and
 * https://idosell.readme.io/reference/returnsreturnspost-1 (create).
 * No top-level refund total is documented — only per-product `price` — so
 * `Refund.amount` is intentionally never populated by this transform.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawIdosellReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawIdosellReturn> = {}): RawIdosellReturn {
  return {
    id: 801,
    order_sn: 7001,
    clientNote: 'Towar uszkodzony',
    currency: 'pln',
    date_add: '2024-03-01 10:00:00',
    date_last_edit: '2024-03-02 09:00:00',
    products: [
      { id: 1201, quantity: 1, price: 99.99 },
      { id: 1202, quantity: 2, price: 25.0 },
    ],
    ...overrides,
  }
}

describe('transformRefund (idosell)', () => {
  it('maps id and orderId (from order_sn)', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('801')
    expect(result.orderId).toBe('7001')
  })

  it('maps note from clientNote, falling back to userNote', () => {
    expect(transformRefund(makeRaw()).note).toBe('Towar uszkodzony')
    expect(transformRefund(makeRaw({ clientNote: undefined, userNote: 'op note' })).note).toBe('op note')
  })

  it('never invents a top-level amount — none is documented on the return object', () => {
    expect(transformRefund(makeRaw()).amount).toBeUndefined()
  })

  it('maps refund line items with real per-line price', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(2)
    expect(result.refundLineItems![0]).toMatchObject({
      lineItemId: '1201',
      quantity: 1,
      amount: { amount: 9999, currency: 'PLN' },
    })
  })

  it('drops a product row missing quantity rather than inventing one', () => {
    const result = transformRefund(makeRaw({ products: [{ id: 1203, price: 10 }] }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('leaves per-line amount undefined when no return currency is reported', () => {
    const result = transformRefund(makeRaw({ currency: undefined }))
    expect(result.refundLineItems![0]!.amount).toBeUndefined()
  })

  it('normalises date_add/date_last_edit to strict ISO UTC', () => {
    const result = transformRefund(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-02T09:00:00.000Z')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRaw()))).not.toThrow()
  })

  it('untransformRefund builds order_sn + products for POST /returns/returns', () => {
    const body = untransformRefund(transformRefund(makeRaw()))
    expect(body['order_sn']).toBe(7001)
    expect(body['products']).toEqual([
      { id: 1201, quantity: 1 },
      { id: 1202, quantity: 2 },
    ])
  })
})
