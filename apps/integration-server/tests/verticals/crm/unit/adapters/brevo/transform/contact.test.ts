import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/contact'

describe('brevo transformContact', () => {
  it('maps raw Brevo contact to canonical Contact', () => {
    const raw = {
      id: 42,
      email: 'marie@example.fr',
      attributes: {
        FIRSTNAME: 'Marie',
        LASTNAME: 'Curie',
        SMS: '+33123456789',
      },
      linkedCompaniesIds: ['company-1'],
      createdAt: '2023-01-15T10:00:00Z',
      modifiedAt: '2023-06-20T09:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('42')
    expect(contact.first_name).toBe('Marie')
    expect(contact.last_name).toBe('Curie')
    expect(contact.name).toBe('Marie Curie')
    expect(contact.email).toBe('marie@example.fr')
    expect(contact.phone).toBe('+33123456789')
    expect(contact.company_id).toBe('company-1')
    expect(contact.created_at).toBe('2023-01-15T10:00:00Z')
    expect(contact.updated_at).toBe('2023-06-20T09:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 7, email: 'test@example.com' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('7')
    expect(contact.first_name).toBeUndefined()
    expect(contact.last_name).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Brevo shape', () => {
    const data = {
      email: 'pierre@example.fr',
      first_name: 'Pierre',
      last_name: 'Dupont',
      phone: '+33987654321',
    }
    const out = untransformContact(data)
    expect(out.email).toBe('pierre@example.fr')
    expect((out.attributes as Record<string, unknown>).FIRSTNAME).toBe('Pierre')
    expect((out.attributes as Record<string, unknown>).LASTNAME).toBe('Dupont')
    expect((out.attributes as Record<string, unknown>).SMS).toBe('+33987654321')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 42,
      email: 'marie@example.fr',
      attributes: {
        FIRSTNAME: 'Marie',
        LASTNAME: 'Curie',
        SMS: '+33123456789',
      },
      linkedCompaniesIds: ['company-1'],
      createdAt: '2023-01-15T10:00:00Z',
      modifiedAt: '2023-06-20T09:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
