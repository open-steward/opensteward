import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPrimerCustomer,
} from '../../../../../../../src/verticals/payments/adapters/primer/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('primer transformCustomer', () => {
  it('builds full name from firstName and lastName and uses external id param', () => {
    const raw: RawPrimerCustomer = {
      firstName: 'Alice',
      lastName: 'Smith',
      emailAddress: 'alice@example.com',
      mobileNumber: '+1-555-000-0001',
      dateCreated: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw, 'cus_external')
    expect(result.id).toBe('cus_external')
    expect(result.externalId).toBe('cus_external')
    expect(result.name).toBe('Alice Smith')
    expect(result.email).toBe('alice@example.com')
    expect(result.phone).toBe('+1-555-000-0001')
    expect(result.gateway).toBe('primer')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to customerId field on the raw object when id param is absent', () => {
    const raw: RawPrimerCustomer = {
      customerId: 'cus_raw_id',
      emailAddress: 'bob@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_raw_id')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to billingAddress name fields when top-level names are absent', () => {
    const raw: RawPrimerCustomer = {
      billingAddress: {
        firstName: 'Charlie',
        lastName: 'Brown',
        emailAddress: 'charlie@example.com',
      },
    }
    const result = transformCustomer(raw, 'cus_bill')
    expect(result.name).toBe('Charlie Brown')
    expect(result.email).toBe('charlie@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when no name fields are present', () => {
    const raw: RawPrimerCustomer = { emailAddress: 'empty@example.com' }
    const result = transformCustomer(raw, 'cus_noname')
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
