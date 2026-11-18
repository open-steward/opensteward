import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawJumpsellerCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer (jumpseller)', () => {
  const raw: RawJumpsellerCustomer = {
    id: 555,
    email: 'sofia@example.cl',
    first_name: 'Sofía',
    last_name: 'González',
    phone: '912345678',
    phone_prefix: '+56',
    billing_address: {
      name: 'Sofía',
      surname: 'González',
      address: 'Av. Providencia',
      street_number: '1234',
      complement: 'Depto 5',
      city: 'Santiago',
      postal: '7500000',
      region: 'Metropolitana',
      country: 'Chile',
      country_code: 'CL',
    },
    shipping_address: {
      address: 'Las Condes',
      street_number: '500',
      city: 'Las Condes',
      country_code: 'CL',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformCustomer(raw)
    expect(result.id).toBe('555')
  })

  it('maps email', () => {
    const result = transformCustomer(raw)
    expect(result.email).toBe('sofia@example.cl')
  })

  it('maps firstName and lastName', () => {
    const result = transformCustomer(raw)
    expect(result.firstName).toBe('Sofía')
    expect(result.lastName).toBe('González')
  })

  it('concatenates phone_prefix and phone', () => {
    const result = transformCustomer(raw)
    expect(result.phone).toBe('+56912345678')
  })

  it('uses plain phone when no prefix', () => {
    const result = transformCustomer({ ...raw, phone_prefix: undefined })
    expect(result.phone).toBe('912345678')
  })

  it('maps defaultAddress from billing_address, joining address + street_number', () => {
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.line1).toBe('Av. Providencia 1234')
    expect(result.defaultAddress?.line2).toBe('Depto 5')
    expect(result.defaultAddress?.city).toBe('Santiago')
    expect(result.defaultAddress?.country).toBe('CL') // prefers country_code
  })

  it('includes both billing and shipping in addresses array', () => {
    const result = transformCustomer(raw)
    // Both billing and shipping yield valid addresses
    expect(result.addresses?.length).toBeGreaterThanOrEqual(2)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles null billing_address gracefully', () => {
    const result = transformCustomer({ ...raw, billing_address: null, shipping_address: null })
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toEqual([])
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const result = transformCustomer(raw)
    const back = untransformCustomer(result)
    expect(back.email).toBe(raw.email)
    expect(back.first_name).toBe(raw.first_name)
    const billing = back.billing_address as Record<string, unknown>
    expect(billing.city).toBe('Santiago')
  })
})
