import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCloverCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCloverCustomer> = {}): RawCloverCustomer {
  return {
    id: 'CUST_001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    emailAddresses: { elements: [{ emailAddress: 'ada@example.com' }] },
    phoneNumbers: { elements: [{ phoneNumber: '+1 555 000 1111' }] },
    marketingAllowed: true,
    addresses: {
      elements: [
        {
          address1: '1 Computing Ln',
          city: 'London',
          zip: 'NW1 2AB',
          country: 'GB',
        },
      ],
    },
    orders: { elements: [{ id: 'ORD_001' }, { id: 'ORD_002' }] },
    createdTime: 1705305600000,
    modifiedTime: 1709251200000,
    ...overrides,
  }
}

describe('transformCustomer (Clover)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('CUST_001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps address from first element', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Computing Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps marketing preferences', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps orders count', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(2)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const minimal: RawCloverCustomer = { id: 'CUST_MIN' }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('CUST_MIN')
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Clover)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['firstName']).toBe('Ada')
    expect(raw['lastName']).toBe('Lovelace')
  })

  it('wraps email in emailAddresses structure', () => {
    const raw = untransformCustomer({ email: 'test@example.com' })
    const emails = raw['emailAddresses'] as Record<string, unknown>
    expect((emails['elements'] as Array<Record<string, unknown>>)[0]!['emailAddress']).toBe('test@example.com')
  })

  it('wraps phone in phoneNumbers structure', () => {
    const raw = untransformCustomer({ phone: '+1 555 0000' })
    const phones = raw['phoneNumbers'] as Record<string, unknown>
    expect((phones['elements'] as Array<Record<string, unknown>>)[0]!['phoneNumber']).toBe('+1 555 0000')
  })
})
