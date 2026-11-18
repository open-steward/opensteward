import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawComputopCustomer,
} from '../../../../../../../src/verticals/payments/adapters/computop/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('computop transformCustomer', () => {
  it('maps a full customer record', () => {
    const raw: RawComputopCustomer = {
      id: 'cu-001',
      merchantCustomerId: 'ext-cus-001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: { countryCode: '+1', number: '4155550123' },
      billingAddress: {
        streetName: 'Main St',
        streetNumber: '42',
        city: 'San Francisco',
        postalCode: '94105',
        state: 'CA',
        country: 'US',
      },
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cu-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.gateway).toBe('computop')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.country).toBe('US')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to merchantCustomerId when id is absent', () => {
    const raw: RawComputopCustomer = {
      merchantCustomerId: 'ext-cus-002',
      firstName: 'John',
      email: 'john@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ext-cus-002')
    expect(result.name).toBe('John')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses companyName when personal name parts are absent', () => {
    const raw: RawComputopCustomer = {
      id: 'cu-003',
      companyName: 'Acme Corp',
      email: 'info@acme.example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Acme Corp')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits billingAddress when absent', () => {
    const raw: RawComputopCustomer = {
      id: 'cu-004',
      email: 'test@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits country when it is well-formed but not a real ISO 3166-1 alpha-2 code', () => {
    // 'XK' is two letters but is not officially ISO-assigned (user-assigned,
    // for Kosovo) — pickCountry must reject it by membership, not shape.
    const raw: RawComputopCustomer = {
      id: 'cu-005',
      billingAddress: { city: 'Pristina', country: 'XK' },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.city).toBe('Pristina')
    expect(result.billingAddress?.country).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
