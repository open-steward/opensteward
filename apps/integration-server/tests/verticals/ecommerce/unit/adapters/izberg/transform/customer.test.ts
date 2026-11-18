import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawIzbergUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<RawIzbergUser> = {}): RawIzbergUser {
  return {
    id: 99,
    resource_uri: '/v1/user/99/',
    username: 'alice99',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Dupont',
    phone: '+33612345678',
    date_joined: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (izberg)', () => {
  it('maps id as string', () => {
    const result = transformCustomer(makeUser())
    expect(result.id).toBe('99')
  })

  it('maps email', () => {
    const result = transformCustomer(makeUser())
    expect(result.email).toBe('alice@example.com')
  })

  it('maps firstName from first_name and lastName from last_name', () => {
    const result = transformCustomer(makeUser())
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Dupont')
  })

  it('maps phone', () => {
    const result = transformCustomer(makeUser())
    expect(result.phone).toBe('+33612345678')
  })

  it('maps createdAt from date_joined via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformCustomer(makeUser())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('omits email when null', () => {
    const result = transformCustomer(makeUser({ email: null }))
    expect(result.email).toBeUndefined()
  })

  it('omits phone when null', () => {
    const result = transformCustomer(makeUser({ phone: null }))
    expect(result.phone).toBeUndefined()
  })

  it('omits createdAt when date_joined is null', () => {
    const result = transformCustomer(makeUser({ date_joined: null }))
    expect(result.createdAt).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeUser()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeUser())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('alice@example.com')
    expect(body['first_name']).toBe('Alice')
    expect(body['last_name']).toBe('Dupont')
    expect(body['phone']).toBe('+33612345678')
  })
})
