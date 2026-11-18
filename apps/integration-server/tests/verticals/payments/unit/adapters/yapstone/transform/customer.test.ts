import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawYapstoneCustomer,
} from '../../../../../../../src/verticals/payments/adapters/yapstone/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('yapstone transformCustomer', () => {
  it('maps basic customer fields including email and firstName as name', () => {
    const raw: RawYapstoneCustomer = {
      id: 'cust-001',
      email: 'jane@example.com',
      firstName: 'Jane',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane')
    expect(result.gateway).toBe('yapstone')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a customer with no optional fields', () => {
    const raw: RawYapstoneCustomer = {
      id: 'cust-002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.gateway).toBe('yapstone')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uses metadata extra object when provided', () => {
    const raw: RawYapstoneCustomer = {
      id: 'cust-003',
      email: 'bob@example.com',
      extra: { source: 'api' },
    }
    const result = transformCustomer(raw)
    expect(result.metadata['source']).toBe('api')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
