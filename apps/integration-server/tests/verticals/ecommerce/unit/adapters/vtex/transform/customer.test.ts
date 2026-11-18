import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawVtexCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawVtexCustomer> = {}): RawVtexCustomer {
  return {
    id: 'CL-001',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+5511999990000',
    totalOrders: 3,
    createdIn: '2024-01-10T12:00:00.000Z',
    updatedIn: '2024-05-01T09:00:00.000Z',
    homeStreet: 'Rua das Flores',
    homeNumber: '42',
    homeCity: 'São Paulo',
    homeState: 'SP',
    homePostalCode: '01310-100',
    homeCountry: 'BR',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core identity fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('CL-001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+5511999990000')
    expect(result.ordersCount).toBe(3)
  })

  it('builds defaultAddress from flat home* fields with street+number joined', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress?.line1).toBe('Rua das Flores, 42')
    expect(result.defaultAddress?.city).toBe('São Paulo')
    expect(result.defaultAddress?.region).toBe('SP')
    expect(result.defaultAddress?.postalCode).toBe('01310-100')
    expect(result.defaultAddress?.country).toBe('BR')
  })

  it('populates addresses array when address is present', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]).toEqual(result.defaultAddress)
  })

  it('omits defaultAddress and addresses when no home* fields', () => {
    const result = transformCustomer(
      makeCustomer({
        homeStreet: undefined,
        homeNumber: undefined,
        homeCity: undefined,
        homePostalCode: undefined,
        homeCountry: undefined,
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('falls back phone to homePhone when phone is absent', () => {
    const result = transformCustomer(
      makeCustomer({ phone: undefined, homePhone: '+5511888880000' }),
    )
    expect(result.phone).toBe('+5511888880000')
  })

  it('maps ISO datetime strings for createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-10T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T09:00:00.000Z')
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
})

describe('untransformCustomer', () => {
  it('round-trips identity fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['email']).toBe('ada@example.com')
    expect(raw['firstName']).toBe('Ada')
    expect(raw['lastName']).toBe('Lovelace')
    expect(raw['phone']).toBe('+5511999990000')
  })

  it('round-trips address fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    // line1 is stored as homeStreet (first part only)
    expect(raw['homeCity']).toBe('São Paulo')
    expect(raw['homeState']).toBe('SP')
    expect(raw['homePostalCode']).toBe('01310-100')
    expect(raw['homeCountry']).toBe('BR')
  })

  it('omits address fields when no defaultAddress', () => {
    const raw = untransformCustomer({ email: 'ada@example.com' })
    expect(raw['homeCity']).toBeUndefined()
    expect(raw['homeStreet']).toBeUndefined()
  })
})
