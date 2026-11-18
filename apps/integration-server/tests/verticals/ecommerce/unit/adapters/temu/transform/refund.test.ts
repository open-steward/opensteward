/**
 * Temu refund transform. The fixture follows the documented `response_sample`
 * of bg.aftersales.parentaftersales.list.get (`result.data[]`, fetched
 * 2026-09-25 from POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get).
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTemuRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/temu/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRow(overrides: Partial<RawTemuRefund> = {}): RawTemuRefund {
  return {
    parentAfterSalesSn: 'PAS-211-0001',
    afterSalesStatusGroup: 5,
    operateExpireTimeMs: 1706000000000,
    availableOperateList: [],
    returnDeliveryType: 3,
    parentAfterSalesStatus: 5,
    parentOrderSn: 'PO-211-21905452099192792',
    updateAt: 1705574400,
    afterSalesType: 1,
    createAt: 1705488000,
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('parses with RefundSchema', () => {
    const r = RefundSchema.parse(transformRefund(makeRow()))
    expect(r.id).toBe('PAS-211-0001')
    expect(r.orderId).toBe('PO-211-21905452099192792')
  })

  it('invents no amount and keeps the raw row as metadata', () => {
    const raw = makeRow()
    const r = transformRefund(raw)
    expect(r.amount).toBeUndefined()
    expect(r.createdAt).toBeUndefined()
    expect(r.metadata).toEqual(raw)
  })

  it('throws without parentAfterSalesSn or parentOrderSn', () => {
    expect(() => transformRefund(makeRow({ parentAfterSalesSn: undefined }))).toThrow(
      /parentAfterSalesSn/,
    )
    expect(() => transformRefund(makeRow({ parentOrderSn: undefined }))).toThrow(/parentOrderSn/)
  })
})
