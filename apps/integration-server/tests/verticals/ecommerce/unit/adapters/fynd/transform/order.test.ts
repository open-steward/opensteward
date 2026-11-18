/**
 * Fixture shapes verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Order/OrderPlatformModel.js` — `PlatformOrderItems()` (list)
 * and `OrderData()` (detail; note it has no `order_value` field).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrderListItem,
  transformOrderDetail,
  type RawFyndOrderListItem,
  type RawFyndOrderDetail,
  type RawFyndOrderUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeListItem(overrides: Partial<RawFyndOrderListItem> = {}): RawFyndOrderListItem {
  return {
    order_id: 'FY123456',
    order_created_time: '2026-01-15T09:30:00.000Z',
    order_value: 999.5,
    currency: { currency_code: 'INR' },
    user_info: { id: 42, email: 'jane.doe@example.com', mobile: '9820012345' },
    ...overrides,
  }
}

function makeDetail(overrides: Partial<RawFyndOrderDetail> = {}): RawFyndOrderDetail {
  return {
    fynd_order_id: 'FY123456',
    order_date: '2026-01-15T09:30:00.000Z',
    currency: { currency_code: 'INR' },
    ...overrides,
  }
}

const detailUser: RawFyndOrderUser = { id: 42, email: 'jane.doe@example.com', mobile: '9820012345' }

describe('transformOrderListItem', () => {
  it('maps core fields and converts order_value to minor units', () => {
    const result = transformOrderListItem(makeListItem())
    expect(result.id).toBe('FY123456')
    expect(result.customerId).toBe('42')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.currency).toBe('INR')
    expect(result.totalPrice).toEqual({ amount: 99950, currency: 'INR' })
  })

  it('throws when order_id is missing', () => {
    expect(() =>
      transformOrderListItem({ ...makeListItem(), order_id: undefined as unknown as string }),
    ).toThrow(/order_id/)
  })

  it('leaves totalPrice unset when currency is absent, rather than guessing one', () => {
    const result = transformOrderListItem({ ...makeListItem(), currency: undefined })
    expect(result.totalPrice).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeListItem()
    expect(transformOrderListItem(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrderListItem(makeListItem()))).not.toThrow()
  })
})

describe('transformOrderDetail', () => {
  it('maps core fields from the nested user and OrderData, with no totalPrice', () => {
    const result = transformOrderDetail(makeDetail(), detailUser)
    expect(result.id).toBe('FY123456')
    expect(result.customerId).toBe('42')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.currency).toBe('INR')
    expect(result.totalPrice).toBeUndefined()
  })

  it('throws when fynd_order_id is missing', () => {
    expect(() =>
      transformOrderDetail({ ...makeDetail(), fynd_order_id: undefined as unknown as string }, detailUser),
    ).toThrow(/fynd_order_id/)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrderDetail(makeDetail(), detailUser))).not.toThrow()
  })
})
