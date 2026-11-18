import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawMissiveContact,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('missive transformContact', () => {
  const raw: RawMissiveContact = {
    id: 'contact-abc-123',
    first_name: 'Jane',
    middle_name: 'Marie',
    last_name: 'Doe',
    starred: true,
    deleted: false,
    modified_at: '2024-03-15T10:00:00.000Z',
    contact_book: { id: 'book-1', name: 'Main' },
    infos: [
      { type: 'email', value: 'jane.doe@example.com' },
      { type: 'phone', value: '+14155550123' },
    ],
    memberships: [],
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformContact(raw)
    expect(result.id).toBe('contact-abc-123')
    expect(result.externalId).toBe('contact-abc-123')
  })

  it('builds full name from first_name + middle_name + last_name', () => {
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Marie Doe')
  })

  it('extracts email from infos array', () => {
    const result = transformContact(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('extracts phone from infos array', () => {
    const result = transformContact(raw)
    expect(result.phone).toBe('+14155550123')
  })

  it('maps contact_book.id to organizationId', () => {
    const result = transformContact(raw)
    expect(result.organizationId).toBe('book-1')
  })

  it('sets platform to missive', () => {
    const result = transformContact(raw)
    expect(result.platform).toBe('missive')
  })

  it('produces a ContactSchema-valid result', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('handles missing infos — email and phone undefined', () => {
    const minimal: RawMissiveContact = { id: 'x', first_name: 'Bob' }
    const result = transformContact(minimal)
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.name).toBe('Bob')
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('omits organizationId when contact_book is absent', () => {
    const minimal: RawMissiveContact = { id: 'x' }
    const result = transformContact(minimal)
    expect(result.organizationId).toBeUndefined()
  })
})
