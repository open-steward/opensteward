import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawToastCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawToastCustomer> = {}): RawToastCustomer {
  return {
    guid: 'CUST_001',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1 512 555 1234',
    marketingOptIn: true,
    createdDate: '2024-01-10T12:00:00.000Z',
    modifiedDate: '2024-03-01T15:30:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (Toast)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('CUST_001')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+1 512 555 1234')
  })

  it('maps marketing opt-in', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('handles null email gracefully', () => {
    const result = transformCustomer(makeCustomer({ email: null }))
    expect(result.email).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['firstName']).toBe('Jane')
    expect(raw['lastName']).toBe('Doe')
    expect(raw['email']).toBe('jane@example.com')
    expect(raw['phone']).toBe('+1 512 555 1234')
    expect(raw['marketingOptIn']).toBe(true)
  })
})
