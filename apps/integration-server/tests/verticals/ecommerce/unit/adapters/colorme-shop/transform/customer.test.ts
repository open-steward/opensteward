/**
 * ColorMe Shop Customer → canonical Customer — verified against
 * paths["/v1/customers"] in https://api.shop-pro.jp/v1/spec/open_api.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawColormeCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/colorme-shop/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawColormeCustomer> = {}): RawColormeCustomer {
  return {
    id: 1028030,
    name: 'ペパボ太郎',
    mail: 'taro@example.jp',
    tel: '0312345678',
    postal: '1500001',
    address1: '渋谷区神南1-1-1',
    pref_name: '東京都',
    receive_mail_magazine: true,
    sales_count: 4,
    make_date: 1465784934,
    update_date: 1494496809,
    ...overrides,
  }
}

describe('transformCustomer (colorme-shop)', () => {
  it('maps id, email, and the single name field onto firstName', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('1028030')
    expect(result.email).toBe('taro@example.jp')
    expect(result.firstName).toBe('ペパボ太郎')
    expect(result.lastName).toBeUndefined()
  })

  it('maps a Japan-only address (country is a verified platform fact, not a default)', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.country).toBe('JP')
    expect(result.defaultAddress?.region).toBe('東京都')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    expect(untransformCustomer(transformCustomer(makeRaw()))['mail']).toBe('taro@example.jp')
  })
})
