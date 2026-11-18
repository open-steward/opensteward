import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type KwaraMember } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/contact'

function makeRaw(overrides: Partial<KwaraMember> = {}): KwaraMember {
  return {
    id: 'mem-001',
    full_name: 'Jane Doe',
    email: 'jane@example.com',
    phone_number: '+2341234567890',
    address: '123 Main St, Lagos',
    ...overrides,
  }
}

describe('transformContact (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformContact(makeRaw())
    expect(r.id).toBe('mem-001')
    expect(r.name).toBe('Jane Doe')
    expect(r.isCustomer).toBe(true)
    expect(r.isSupplier).toBe(false)
  })

  it('maps email correctly', () => {
    const r = transformContact(makeRaw())
    expect(r.emails).toHaveLength(1)
    expect(r.emails![0].email).toBe('jane@example.com')
  })

  it('maps phone number correctly', () => {
    const r = transformContact(makeRaw())
    expect(r.telephones).toHaveLength(1)
    expect(r.telephones![0].telephone).toBe('+2341234567890')
  })

  it('maps address to billingAddress', () => {
    const r = transformContact(makeRaw())
    expect(r.billingAddress?.address1).toBe('123 Main St, Lagos')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformContact(makeRaw({ email: undefined, phone_number: undefined, address: undefined }))
    expect(r.emails).toBeUndefined()
    expect(r.telephones).toBeUndefined()
    expect(r.billingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
