import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawRecurlyAccount,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('recurly transformCustomer', () => {
  it('maps a full account record correctly', () => {
    const raw: RawRecurlyAccount = {
      id: 'acc-001',
      code: 'code-001',
      email: 'user@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      company: 'Acme Corp',
      currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('acc-001')
    expect(result.externalId).toBe('code-001')
    expect(result.email).toBe('user@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.description).toBe('Acme Corp')
    expect(result.gateway).toBe('recurly')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses company as name when first/last name are absent', () => {
    const raw: RawRecurlyAccount = {
      id: 'acc-002',
      code: 'code-002',
      email: 'corp@example.com',
      company: 'Big Corp',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Big Corp')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal account gracefully', () => {
    const raw: RawRecurlyAccount = {
      id: 'acc-003',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('acc-003')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
