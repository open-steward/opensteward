import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawGCCustomer,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('gocardless transformCustomer', () => {
  it('maps a full individual customer', () => {
    const raw: RawGCCustomer = {
      id: 'CU001',
      email: 'alice@example.com',
      given_name: 'Alice',
      family_name: 'Smith',
      phone_number: '+447700900123',
      country_code: 'GB',
      language: 'en',
      address_line1: '1 High Street',
      address_line2: 'Apt 2',
      city: 'London',
      region: 'England',
      postal_code: 'EC1A 1BB',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('CU001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.phone).toBe('+447700900123')
    expect(result.billingAddress?.line1).toBe('1 High Street')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.gateway).toBe('gocardless')
    expect(result.metadata.language).toBe('en')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('prefers company_name over given/family name', () => {
    const raw: RawGCCustomer = {
      id: 'CU002',
      email: 'corp@example.com',
      given_name: 'John',
      family_name: 'Doe',
      company_name: 'Acme Ltd',
      country_code: 'DE',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Acme Ltd')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits billingAddress when address_line1 is absent', () => {
    const raw: RawGCCustomer = {
      id: 'CU003',
      email: 'nobody@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('builds name from given + family when company absent', () => {
    const raw: RawGCCustomer = {
      id: 'CU004',
      given_name: 'Bob',
      family_name: 'Jones',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Bob Jones')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
