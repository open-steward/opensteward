/**
 * Ozon FBS return → canonical Refund.
 *
 * Source: `POST /v3/returns/company/fbs` (ReturnsAPI). Response
 * `{ returns: [{ id, posting_number, sku, product_id, product_name,
 * quantity, price, return_reason_name, return_date, status, … }], last_id }`
 * from Ozon's official OpenAPI spec:
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 * Path confirmed live 2026-09-13.
 *
 * The return row carries `price` but no currency, so no canonical `amount`
 * is emitted — guessing RUB would be inventing data.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawOzonFbsReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/ozon/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawOzonFbsReturn> = {}): RawOzonFbsReturn {
  return {
    id: 1000015552,
    posting_number: '05708065-0029-1',
    product_id: 214887921,
    sku: 1076001,
    product_name: 'Клавиатура',
    quantity: 1,
    price: 1390,
    price_without_commission: 1112,
    commission: 278,
    commission_percent: 20,
    return_reason_name: 'Не подошёл',
    return_date: '2024-05-25T12:00:00Z',
    status: 'returned_to_seller',
    is_opened: false,
    ...overrides,
  }
}

describe('ozon transformRefund', () => {
  it('maps id, the posting it belongs to, and the reason', () => {
    const refund = transformRefund(makeReturn())!
    expect(refund.id).toBe('1000015552')
    expect(refund.orderId).toBe('05708065-0029-1')
    expect(refund.reason).toBe('Не подошёл')
  })

  it('links the returned quantity to the posting line item id used by orders', () => {
    expect(transformRefund(makeReturn())!.refundLineItems).toEqual([
      { lineItemId: '05708065-0029-1:1076001', quantity: 1 },
    ])
  })

  it('does not invent an amount: the row has no currency', () => {
    expect(transformRefund(makeReturn())!.amount).toBeUndefined()
  })

  it('takes createdAt from return_date only when it carries a zone', () => {
    expect(transformRefund(makeReturn())!.createdAt).toBe('2024-05-25T12:00:00.000Z')
    expect(transformRefund(makeReturn({ return_date: '2024-05-25 12:00:00' }))!.createdAt).toBeUndefined()
  })

  it('skips a row with no posting number instead of fabricating an order id', () => {
    expect(transformRefund(makeReturn({ posting_number: '' }))).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeReturn()
    expect(transformRefund(raw)!.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const parsed = RefundSchema.parse(transformRefund(makeReturn()))
    expect(parsed.orderId).toBe('05708065-0029-1')
  })
})
