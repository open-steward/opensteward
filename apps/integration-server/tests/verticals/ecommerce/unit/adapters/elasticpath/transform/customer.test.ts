import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawEpCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawEpCustomer> = {}): RawEpCustomer {
  return {
    id: 'cust-001',
    type: 'customer',
    name: 'Jane Doe',
    email: 'jane@example.com',
    created_at: '2024-03-01T08:00:00.000Z',
    updated_at: '2024-06-15T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.createdAt).toBe('2024-03-01T08:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('handles single-word name (first name only)', () => {
    const result = transformCustomer(makeCustomer({ name: 'Prince' }))
    expect(result.firstName).toBe('Prince')
    expect(result.lastName).toBeUndefined()
  })

  it('handles multi-word last name', () => {
    const result = transformCustomer(makeCustomer({ name: 'Jean Paul Getty' }))
    expect(result.firstName).toBe('Jean')
    expect(result.lastName).toBe('Paul Getty')
  })

  it('handles missing name', () => {
    const result = transformCustomer(makeCustomer({ name: undefined }))
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Elastic Path)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical) as {
      data: { type: string; name: string; email: string }
    }
    expect(body.data.type).toBe('customer')
    expect(body.data.name).toBe('Jane Doe')
    expect(body.data.email).toBe('jane@example.com')
  })

  it('joins first and last name', () => {
    const body = untransformCustomer({ firstName: 'Alice', lastName: 'Smith' }) as {
      data: { name: string }
    }
    expect(body.data.name).toBe('Alice Smith')
  })
})
