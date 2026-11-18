import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawAuthNetCustomerProfile,
} from '../../../../../../../src/verticals/payments/adapters/authorize-net/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('authorize-net transformCustomer', () => {
  const base: RawAuthNetCustomerProfile = {
    customerProfileId: 'profile-55555',
    merchantCustomerId: 'merchant-cust-001',
    email: 'customer@example.com',
    description: 'Enterprise account',
  }

  it('maps customerProfileId to id and externalId', () => {
    const result = transformCustomer(base)
    expect(result.id).toBe('profile-55555')
    expect(result.externalId).toBe('profile-55555')
  })

  it('maps email', () => {
    const result = transformCustomer(base)
    expect(result.email).toBe('customer@example.com')
  })

  it('maps merchantCustomerId to name', () => {
    const result = transformCustomer(base)
    expect(result.name).toBe('merchant-cust-001')
  })

  it('maps description', () => {
    const result = transformCustomer(base)
    expect(result.description).toBe('Enterprise account')
  })

  it('puts merchantCustomerId in metadata', () => {
    const result = transformCustomer(base)
    expect(result.metadata['merchantCustomerId']).toBe('merchant-cust-001')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformCustomer(base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('handles missing optional fields', () => {
    const result = transformCustomer({ customerProfileId: 'profile-1' })
    expect(result.id).toBe('profile-1')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
  })

  it('conforms to CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(base))).not.toThrow()
  })
})
