import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawBluesnapVaultedShopper,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('bluesnap transformCustomer', () => {
  it('maps a flat vaulted shopper (create response) to a canonical customer', () => {
    const raw: RawBluesnapVaultedShopper = {
      vaultedShopperId: 'SHOPPER-001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+14155550123',
      country: 'US',
      city: 'New York',
      zip: '10001',
      shopperCurrency: 'USD',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('SHOPPER-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('bluesnap')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a nested shopper (retrieve response) reading shopperContactInfo', () => {
    const raw: RawBluesnapVaultedShopper = {
      vaultedShopperId: 'SHOPPER-002',
      shopperInfo: {
        shopperContactInfo: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          country: 'GB',
        },
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('SHOPPER-002')
    expect(result.email).toBe('john.smith@example.com')
    expect(result.name).toBe('John Smith')
    expect(result.billingAddress?.country).toBe('GB')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('builds billingAddress from contact fields', () => {
    const raw: RawBluesnapVaultedShopper = {
      vaultedShopperId: 'SHOPPER-003',
      email: 'addr@example.com',
      address: '123 Main St',
      address2: 'Apt 4',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      country: 'US',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.line2).toBe('Apt 4')
    expect(result.billingAddress?.city).toBe('Chicago')
    expect(result.billingAddress?.region).toBe('IL')
    expect(result.billingAddress?.postalCode).toBe('60601')
    expect(result.billingAddress?.country).toBe('US')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('carries companyName into metadata', () => {
    const raw: RawBluesnapVaultedShopper = {
      vaultedShopperId: 'SHOPPER-004',
      email: 'corp@example.com',
      companyName: 'Acme Corp',
    }
    const result = transformCustomer(raw)
    expect(result.metadata['companyName']).toBe('Acme Corp')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
