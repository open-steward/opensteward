import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawVerifone2checkoutCustomer,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('verifone-2checkout transformCustomer', () => {
  it('maps full customer data correctly', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-001',
      ExternalCustomerReference: 'EXT-001',
      Email: 'jane.doe@example.com',
      FirstName: 'Jane',
      LastName: 'Doe',
      Phone: '+14155550123',
      Company: 'Acme Inc',
      Address1: '123 Main St',
      Address2: 'Suite 100',
      City: 'San Francisco',
      State: 'CA',
      Zip: '94105',
      CountryCode: 'us',
      Enabled: true,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('AVCUST-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.line2).toBe('Suite 100')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to ExternalCustomerReference when AvangateCustomerReference is absent', () => {
    const raw: RawVerifone2checkoutCustomer = {
      ExternalCustomerReference: 'EXT-002',
      Email: 'bob@example.com',
      FirstName: 'Bob',
      LastName: 'Smith',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('EXT-002')
    expect(result.externalId).toBe('EXT-002')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses AvangateCustomerReference (number) as id string', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 12345,
      Email: 'user@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('12345')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('trims name and handles single name component', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-003',
      FirstName: 'Alice',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Alice')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('sets name to undefined when no name fields provided', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-004',
      Email: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits billingAddress when no address fields are provided', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-005',
      Email: 'noaddr@example.com',
      FirstName: 'Test',
      LastName: 'User',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uppercases country code in billing address', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-006',
      Address1: '10 Downing St',
      City: 'London',
      CountryCode: 'gb',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.country).toBe('GB')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('includes metadata fields for company and enabled', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-007',
      ExternalCustomerReference: 'EXT-007',
      Company: 'Beta Corp',
      Enabled: false,
    }
    const result = transformCustomer(raw)
    expect(result.metadata.company).toBe('Beta Corp')
    expect(result.metadata.enabled).toBe('false')
    expect(result.metadata.externalCustomerReference).toBe('EXT-007')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input with only AvangateCustomerReference', () => {
    const raw: RawVerifone2checkoutCustomer = {
      AvangateCustomerReference: 'AVCUST-MIN',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('AVCUST-MIN')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
