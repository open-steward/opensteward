import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/contact'

describe('mautic transformContact', () => {
  it('maps raw Mautic Contact (flat fields) to canonical Contact', () => {
    const raw = {
      id: 123,
      firstname: 'Sophie',
      lastname: 'Müller',
      email: 'sophie@example.de',
      phone: '+49123456789',
      mobile: '+49987654321',
      owner: { id: 5 },
      dateAdded: '2023-04-01T00:00:00Z',
      dateModified: '2023-10-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('123')
    expect(contact.first_name).toBe('Sophie')
    expect(contact.last_name).toBe('Müller')
    expect(contact.name).toBe('Sophie Müller')
    expect(contact.email).toBe('sophie@example.de')
    expect(contact.phone).toBe('+49123456789')
    expect(contact.mobile).toBe('+49987654321')
    expect(contact.owner_id).toBe('5')
    expect(contact.metadata).toBe(raw)
  })

  it('maps raw Mautic Contact with nested fields to canonical Contact', () => {
    const raw = {
      id: 456,
      fields: {
        all: {
          firstname: 'Lena',
          lastname: 'Braun',
          email: 'lena@example.de',
        },
      },
      dateAdded: '2023-05-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('456')
    expect(contact.first_name).toBe('Lena')
    expect(contact.last_name).toBe('Braun')
    expect(contact.email).toBe('lena@example.de')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'mautic-001' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('mautic-001')
    expect(contact.email).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Mautic shape', () => {
    const data = {
      first_name: 'Klaus',
      last_name: 'Weber',
      email: 'klaus@example.de',
      phone: '+49333444555',
    }
    const out = untransformContact(data)
    expect(out.firstname).toBe('Klaus')
    expect(out.lastname).toBe('Weber')
    expect(out.email).toBe('klaus@example.de')
    expect(out.phone).toBe('+49333444555')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 123,
      firstname: 'Sophie',
      lastname: 'Müller',
      email: 'sophie@example.de',
      phone: '+49123456789',
      mobile: '+49987654321',
      owner: { id: 5 },
      dateAdded: '2023-04-01T00:00:00Z',
      dateModified: '2023-10-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
