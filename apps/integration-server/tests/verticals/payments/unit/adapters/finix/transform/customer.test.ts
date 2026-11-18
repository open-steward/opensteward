import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawFinixIdentity,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('finix transformCustomer', () => {
  it('maps an identity with person name to customer', () => {
    const raw: RawFinixIdentity = {
      id: 'IDi1',
      application: 'APi1',
      entity: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane.doe@example.com',
        phone: '+15551234567',
      },
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('IDi1')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.phone).toBe('+15551234567')
    expect(result.gateway).toBe('finix')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('prefers business_name over person name', () => {
    const raw: RawFinixIdentity = {
      id: 'IDi2',
      entity: {
        first_name: 'John',
        last_name: 'Smith',
        business_name: 'Acme Corp',
        doing_business_as: 'Acme',
      },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Acme Corp')
    expect(result.metadata['business_name']).toBe('Acme Corp')
    expect(result.metadata['doing_business_as']).toBe('Acme')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles identity with no entity gracefully', () => {
    const raw: RawFinixIdentity = {
      id: 'IDi3',
      entity: null,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('IDi3')
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('merges tags into metadata', () => {
    const raw: RawFinixIdentity = {
      id: 'IDi4',
      entity: { email: 'tagged@example.com' },
      tags: { account_tier: 'premium' },
    }
    const result = transformCustomer(raw)
    expect(result.metadata['account_tier']).toBe('premium')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
