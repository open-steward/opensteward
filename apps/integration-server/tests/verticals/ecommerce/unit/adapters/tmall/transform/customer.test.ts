import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  extractUniqueCustomers,
  splitReceiverName,
  type RawTmallBuyer,
} from '../../../../../../../src/verticals/ecommerce/adapters/tmall/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBuyer(overrides: Partial<RawTmallBuyer> = {}): RawTmallBuyer {
  return {
    buyer_nick: 'tb_buyer_li_mei',
    buyer_email: undefined,
    buyer_alipay_no: 'liwei@alipay.com',
    receiver_name: '李梅',
    receiver_phone: '010-88887777',
    receiver_mobile: '13612345678',
    receiver_state: '广东',
    receiver_city: '深圳市',
    receiver_district: '南山区',
    receiver_address: '科技南十二路1号 腾讯大厦B座2101',
    receiver_zip: '518057',
    credit_score: 250,
    ...overrides,
  }
}

function makeWesternBuyer(overrides: Partial<RawTmallBuyer> = {}): RawTmallBuyer {
  return {
    buyer_nick: 'tb_buyer_john_smith',
    receiver_name: 'John Smith',
    receiver_mobile: '+8613900139000',
    receiver_city: 'Shanghai',
    receiver_address: '100 Nanjing Road, Suite 5A',
    receiver_zip: '200001',
    receiver_state: '上海',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformCustomer (Tmall)', () => {
  it('uses buyer_nick as the canonical id', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.id).toBe('tb_buyer_li_mei')
  })

  it('falls back to buyer_alipay_no when buyer_nick is absent', () => {
    const result = transformCustomer(makeBuyer({ buyer_nick: undefined }))
    expect(result.id).toBe('liwei@alipay.com')
  })

  it('returns empty string id when both nick and alipay_no are absent', () => {
    const result = transformCustomer(makeBuyer({ buyer_nick: undefined, buyer_alipay_no: undefined }))
    expect(result.id).toBe('')
  })

  it('splits a two-character Chinese name correctly (surname-first)', () => {
    // "李梅" → last: "李", first: "梅"
    const result = transformCustomer(makeBuyer())
    expect(result.lastName).toBe('李')
    expect(result.firstName).toBe('梅')
  })

  it('splits a three-character Chinese name correctly', () => {
    // "张三丰" → last: "张", first: "三丰"
    const result = transformCustomer(makeBuyer({ receiver_name: '张三丰' }))
    expect(result.lastName).toBe('张')
    expect(result.firstName).toBe('三丰')
  })

  it('splits a Western full name correctly', () => {
    const result = transformCustomer(makeWesternBuyer())
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('maps receiver_mobile to phone (preferred over receiver_phone)', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.phone).toBe('13612345678')
  })

  it('falls back to receiver_phone when receiver_mobile is absent', () => {
    const result = transformCustomer(makeBuyer({ receiver_mobile: undefined }))
    expect(result.phone).toBe('010-88887777')
  })

  it('maps receiver fields to defaultAddress', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress).toMatchObject({
      line1: '科技南十二路1号 腾讯大厦B座2101',
      city: '深圳市',
      region: '广东',
      postalCode: '518057',
      country: 'CN',
    })
  })

  it('populates addresses array with the same address as defaultAddress', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]).toEqual(result.defaultAddress)
  })

  it('does not set defaultAddress when no address fields are present', () => {
    const result = transformCustomer(
      makeBuyer({
        receiver_address: undefined,
        receiver_city: undefined,
        receiver_state: undefined,
        receiver_zip: undefined,
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('does not set email (email not exposed by TOP)', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.email).toBeUndefined()
  })

  it('stores the complete raw buyer object in metadata', () => {
    const raw = makeBuyer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['buyer_nick']).toBe('tb_buyer_li_mei')
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeBuyer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles buyer with only nick and no address', () => {
    const minimal: RawTmallBuyer = { buyer_nick: 'just_nick' }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('just_nick')
    expect(result.firstName).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })
})

describe('splitReceiverName', () => {
  it('handles undefined input', () => {
    const { firstName, lastName } = splitReceiverName(undefined)
    expect(firstName).toBeUndefined()
    expect(lastName).toBeUndefined()
  })

  it('handles empty string input', () => {
    const { firstName, lastName } = splitReceiverName('')
    expect(firstName).toBeUndefined()
    expect(lastName).toBeUndefined()
  })

  it('handles single character (no split possible)', () => {
    const { firstName, lastName } = splitReceiverName('张')
    expect(firstName).toBe('张')
    expect(lastName).toBeUndefined()
  })

  it('handles space-separated Western names', () => {
    const { firstName, lastName } = splitReceiverName('Maria Garcia')
    expect(firstName).toBe('Maria')
    expect(lastName).toBe('Garcia')
  })

  it('handles two-word names with a middle name', () => {
    // Only splits on first space — middle name goes into lastName
    const { firstName, lastName } = splitReceiverName('John Michael Smith')
    expect(firstName).toBe('John')
    expect(lastName).toBe('Michael Smith')
  })
})

describe('extractUniqueCustomers', () => {
  it('deduplicates buyers by buyer_nick', () => {
    const trades: RawTmallBuyer[] = [
      makeBuyer({ buyer_nick: 'user_a' }),
      makeBuyer({ buyer_nick: 'user_a' }),
      makeBuyer({ buyer_nick: 'user_b' }),
    ]
    const result = extractUniqueCustomers(trades)
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toEqual(['user_a', 'user_b'])
  })

  it('returns empty array for empty input', () => {
    expect(extractUniqueCustomers([])).toHaveLength(0)
  })

  it('skips buyers with no nick and no alipay_no', () => {
    const trades: RawTmallBuyer[] = [
      { buyer_nick: undefined, buyer_alipay_no: undefined },
      makeBuyer({ buyer_nick: 'valid_user' }),
    ]
    const result = extractUniqueCustomers(trades)
    // The empty-nick entry has id '' which is falsy — not added
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('valid_user')
  })
})
