import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawMovideskContactPerson,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('movidesk transformContact', () => {
  const raw: RawMovideskContactPerson = {
    id: 'abc123',
    codeReferenceAdditional: 'REF-001',
    businessName: 'Jane Doe',
    corporateName: 'Acme Corp',
    personType: 1,
    profileType: 2,
    isActive: true,
    emails: [
      { emailType: 'Personal', email: 'jane@example.com', isDefault: true },
      { emailType: 'Work', email: 'jane@acme.example', isDefault: false },
    ],
    contacts: [{ contactType: 'Mobile Phone', contact: '+14155550123', isDefault: true }],
  }

  it('maps id from raw.id', () => {
    const result = transformContact(raw)
    expect(result.id).toBe('abc123')
  })

  it('maps externalId from codeReferenceAdditional when present', () => {
    const result = transformContact(raw)
    expect(result.externalId).toBe('REF-001')
  })

  it('maps businessName to name', () => {
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('picks default email from emails array', () => {
    const result = transformContact(raw)
    expect(result.email).toBe('jane@example.com')
  })

  it('picks phone from contacts array', () => {
    const result = transformContact(raw)
    expect(result.phone).toBe('+14155550123')
  })

  it('organizationId is undefined (Movidesk contacts have no parent org ref)', () => {
    const result = transformContact(raw)
    expect(result.organizationId).toBeUndefined()
  })

  it('sets platform to movidesk', () => {
    const result = transformContact(raw)
    expect(result.platform).toBe('movidesk')
  })

  it('places profileType in metadata', () => {
    const result = transformContact(raw)
    expect(result.metadata['profileType']).toBe('2')
  })

  it('produces a ContactSchema-valid result', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to first email when none is marked default', () => {
    const noDefault: RawMovideskContactPerson = {
      ...raw,
      emails: [
        { email: 'first@example.com', isDefault: false },
        { email: 'second@example.com', isDefault: false },
      ],
    }
    const result = transformContact(noDefault)
    expect(result.email).toBe('first@example.com')
  })

  it('handles absent emails and contacts', () => {
    const minimal: RawMovideskContactPerson = { id: 'z1', businessName: 'Bob' }
    const result = transformContact(minimal)
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
