import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/contact'

describe('webcrm transformContact', () => {
  it('maps Person to canonical Contact', () => {
    const raw = {
      PersonId: 42,
      PersonFirstName: 'Lars',
      PersonLastName: 'Jensen',
      PersonEmail: 'lars@example.dk',
      PersonPhone: '+4512345678',
      PersonMobile: '+4587654321',
      OrganisationId: 10,
      OwnedBy: 5,
      PersonCreatedAt: '2023-01-01T00:00:00Z',
      PersonUpdatedAt: '2023-06-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('42')
    expect(contact.first_name).toBe('Lars')
    expect(contact.last_name).toBe('Jensen')
    expect(contact.name).toBe('Lars Jensen')
    expect(contact.email).toBe('lars@example.dk')
    expect(contact.phone).toBe('+4512345678')
    expect(contact.mobile).toBe('+4587654321')
    expect(contact.company_id).toBe('10')
    expect(contact.owner_id).toBe('5')
    expect(contact.created_at).toBe('2023-01-01T00:00:00Z')
    expect(contact.updated_at).toBe('2023-06-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { PersonId: 1 }
    const contact = transformContact(raw)
    expect(contact.id).toBe('1')
    expect(contact.first_name).toBeUndefined()
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to webCRM Person', () => {
    const data = { first_name: 'Anna', last_name: 'Nielsen', email: 'anna@example.dk', phone: '+45111', company_id: '7' }
    const out = untransformContact(data)
    expect(out.PersonFirstName).toBe('Anna')
    expect(out.PersonLastName).toBe('Nielsen')
    expect(out.PersonEmail).toBe('anna@example.dk')
    expect(out.PersonPhone).toBe('+45111')
    expect(out.OrganisationId).toBe(7)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      PersonId: 42,
      PersonFirstName: 'Lars',
      PersonLastName: 'Jensen',
      PersonEmail: 'lars@example.dk',
      PersonPhone: '+4512345678',
      PersonMobile: '+4587654321',
      OrganisationId: 10,
      OwnedBy: 5,
      PersonCreatedAt: '2023-01-01T00:00:00Z',
      PersonUpdatedAt: '2023-06-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
