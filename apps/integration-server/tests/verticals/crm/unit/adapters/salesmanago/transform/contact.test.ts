import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/contact'

describe('salesmanago transformContact', () => {
  it('maps raw SALESmanago contact to canonical Contact', () => {
    const raw = {
      contactId: 'sm-100',
      email: 'jan@example.pl',
      name: 'Jan Kowalski',
      phone: '+48123456789',
      ownerId: 'user-5',
      createdOn: 1672531200000,  // 2023-01-01T00:00:00Z
      modifiedOn: 1688169600000, // 2023-07-01T00:00:00Z
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('sm-100')
    expect(contact.email).toBe('jan@example.pl')
    expect(contact.name).toBe('Jan Kowalski')
    expect(contact.phone).toBe('+48123456789')
    expect(contact.owner_id).toBe('user-5')
    expect(contact.created_at).toBe('2023-01-01T00:00:00.000Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { contactId: 'sm-200', email: 'test@example.pl' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('sm-200')
    expect(contact.phone).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to SALESmanago shape', () => {
    const data = { email: 'anna@example.pl', first_name: 'Anna', last_name: 'Nowak', phone: '+48987654321' }
    const out = untransformContact(data)
    expect(out.email).toBe('anna@example.pl')
    expect(out.name).toBe('Anna Nowak')
    expect(out.phone).toBe('+48987654321')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      contactId: 'sm-100',
      email: 'jan@example.pl',
      name: 'Jan Kowalski',
      phone: '+48123456789',
      ownerId: 'user-5',
      createdOn: 1672531200000,  // 2023-01-01T00:00:00Z
      modifiedOn: 1688169600000, // 2023-07-01T00:00:00Z
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
