import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTemuBuyer,
} from '../../../../../../../src/verticals/ecommerce/adapters/temu/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeBuyer(overrides: Partial<RawTemuBuyer> = {}): RawTemuBuyer {
  return {
    buyer_id: 'buyer-001',
    buyer_email: 'ada@example.com',
    buyer_phone: '+14155550101',
    buyer_name: 'Ada Lovelace',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps buyer_id to id as string', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.id).toBe('buyer-001')
  })

  it('maps buyer_id as number to string', () => {
    const result = transformCustomer(makeBuyer({ buyer_id: 12345 }))
    expect(result.id).toBe('12345')
  })

  it('maps email and phone', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.email).toBe('ada@example.com')
    expect(result.phone).toBe('+14155550101')
  })

  it('maps buyer_name to firstName', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.firstName).toBe('Ada Lovelace')
  })

  it('returns undefined email when null', () => {
    const result = transformCustomer(makeBuyer({ buyer_email: null }))
    expect(result.email).toBeUndefined()
  })

  it('returns undefined phone when null', () => {
    const result = transformCustomer(makeBuyer({ buyer_phone: null }))
    expect(result.phone).toBeUndefined()
  })

  it('returns undefined firstName when buyer_name is null', () => {
    const result = transformCustomer(makeBuyer({ buyer_name: null }))
    expect(result.firstName).toBeUndefined()
  })

  it('does not set lastName (Temu does not provide it)', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.lastName).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeBuyer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeBuyer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal buyer with only required id field', () => {
    const result = transformCustomer({ buyer_id: 'min-001' })
    expect(result.id).toBe('min-001')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
