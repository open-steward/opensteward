import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SilaUser } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/contact'

function makeRaw(overrides: Partial<SilaUser> = {}): SilaUser {
  return {
    user_handle: 'user123',
    first_name: 'Alice',
    last_name: 'Smith',
    entity_name: '',
    email: 'alice@sila.money',
    phone: '+12125551234',
    address: '100 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'US',
    ...overrides,
  }
}

describe('sila transformContact', () => {
  it('maps user_handle to id', () => {
    expect(transformContact(makeRaw()).id).toBe('user123')
  })

  it('builds name from first_name + last_name when entity_name absent', () => {
    expect(transformContact(makeRaw()).name).toBe('Alice Smith')
  })

  it('uses entity_name as name when present', () => {
    expect(transformContact(makeRaw({ entity_name: 'Alice LLC' })).name).toBe('Alice LLC')
  })

  it('sets isCustomer=true', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })

  it('sets isSupplier=false', () => {
    expect(transformContact(makeRaw()).isSupplier).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
