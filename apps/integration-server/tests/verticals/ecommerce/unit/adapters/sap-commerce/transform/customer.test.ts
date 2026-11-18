import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  buildPatchForCustomer,
  type RawSapUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<RawSapUser> = {}): RawSapUser {
  return {
    uid: 'john.doe@example.com',
    customerId: 'cust-0001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    addresses: [
      {
        id: 'addr-1',
        line1: '123 Enterprise Way',
        line2: 'Suite 500',
        town: 'Munich',
        region: { isocode: 'DE-BY', name: 'Bavaria' },
        postalCode: '80333',
        country: { isocode: 'DE', name: 'Germany' },
        phone: '+49 89 1234567',
        defaultAddress: true,
        shippingAddress: true,
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-03-15T10:30:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformCustomer(makeUser())
    expect(r.id).toBe('cust-0001')
    expect(r.email).toBe('john.doe@example.com')
    expect(r.firstName).toBe('John')
    expect(r.lastName).toBe('Doe')
  })

  it('falls back to uid when customerId is absent', () => {
    const r = transformCustomer(makeUser({ customerId: undefined }))
    expect(r.id).toBe('john.doe@example.com')
  })

  it('maps default address with region isocode', () => {
    const r = transformCustomer(makeUser())
    expect(r.defaultAddress?.line1).toBe('123 Enterprise Way')
    expect(r.defaultAddress?.city).toBe('Munich')
    expect(r.defaultAddress?.region).toBe('DE-BY')
    expect(r.defaultAddress?.country).toBe('DE')
  })

  it('maps all addresses', () => {
    const r = transformCustomer(makeUser())
    expect(r.addresses).toHaveLength(1)
    expect(r.addresses![0]!.postalCode).toBe('80333')
  })

  it('handles user with no addresses', () => {
    const r = transformCustomer(makeUser({ addresses: undefined }))
    expect(r.addresses).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeUser()
    const r = transformCustomer(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const r = transformCustomer(makeUser())
    expect(() => CustomerSchema.parse(r)).not.toThrow()
  })

  it('maps timestamps', () => {
    const r = transformCustomer(makeUser())
    expect(r.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(r.updatedAt).toBe('2024-03-15T10:30:00.000Z')
  })
})

describe('untransformCustomer (sap-commerce)', () => {
  it('builds a creation body', () => {
    const body = untransformCustomer({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    }) as Record<string, unknown>
    expect(body['uid']).toBe('test@example.com')
    expect(body['email']).toBe('test@example.com')
    expect(body['firstName']).toBe('Test')
  })

  it('includes default address when provided', () => {
    const body = untransformCustomer({
      email: 'test@example.com',
      defaultAddress: { line1: '456 Main St', city: 'Berlin', country: 'DE' },
    }) as Record<string, unknown>
    const addr = body['defaultAddress'] as Record<string, unknown>
    expect(addr['line1']).toBe('456 Main St')
    expect(addr['town']).toBe('Berlin')
  })
})

describe('buildPatchForCustomer (sap-commerce)', () => {
  it('builds patch with only specified fields', () => {
    const patch = buildPatchForCustomer({ email: 'new@example.com' })
    expect(patch['email']).toBe('new@example.com')
    expect(patch).not.toHaveProperty('firstName')
  })

  it('includes all provided fields', () => {
    const patch = buildPatchForCustomer({
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
    })
    expect(Object.keys(patch)).toHaveLength(3)
  })
})
