import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawScayleCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/scayle/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawScayleCustomer> = {}): RawScayleCustomer {
  return {
    id: 2001,
    referenceKey: 'cust-2001',
    firstName: 'Hans',
    lastName: 'Müller',
    email: 'hans@example.de',
    phone: '+49 30 12345678',
    addresses: [
      {
        id: 10,
        street: 'Musterstraße',
        houseNumber: '5A',
        additional: 'EG',
        zipCode: '10115',
        city: 'Berlin',
        countryCode: 'DE',
        state: 'Berlin',
        isDefault: { billing: true, shipping: true },
      },
    ],
    createdAt: '2023-06-01T12:00:00Z',
    updatedAt: '2024-01-20T09:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer (SCAYLE)', () => {
  it('stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('2001')
    expect(typeof result.id).toBe('string')
  })

  it('maps firstName, lastName, email, phone directly', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Müller')
    expect(result.email).toBe('hans@example.de')
    expect(result.phone).toBe('+49 30 12345678')
  })

  it('maps address: concatenates street + houseNumber as line1', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Musterstraße 5A')
    expect(result.defaultAddress?.line2).toBe('EG')
    expect(result.defaultAddress?.city).toBe('Berlin')
    expect(result.defaultAddress?.postalCode).toBe('10115')
    expect(result.defaultAddress?.country).toBe('DE')
  })

  it('picks billing default address as defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    // The address with isDefault.billing = true should be chosen
    expect(result.defaultAddress?.line1).toBe('Musterstraße 5A')
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2023-06-01T12:00:00Z')
    expect(result.updatedAt).toBe('2024-01-20T09:30:00Z')
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

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.firstName).toBe('Hans')
    expect(raw.lastName).toBe('Müller')
    expect(raw.email).toBe('hans@example.de')
  })
})
