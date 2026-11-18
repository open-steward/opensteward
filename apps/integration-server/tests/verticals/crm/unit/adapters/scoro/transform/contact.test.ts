/**
 * Fixtures follow the Contacts field table at https://api.scoro.com/api/v2
 * (contact_id, name, lastname, search_name, contact_type, position,
 * manager_id, created_date, modified_date, means_of_contact,
 * related_companies). The reference has no example response for a person, so
 * the fixture is built from that table; the offset-less modified_date
 * "2012-09-28 15:30:00" is from the documented company example.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/scoro/transform/contact'

const PERSON = {
  contact_id: 31,
  name: 'Marta',
  lastname: 'Tamm',
  search_name: 'Marta Tamm',
  contact_type: 'person',
  position: 'CEO',
  manager_id: 1,
  created_date: '2023-01-15T09:30:00+02:00',
  modified_date: '2023-06-01T10:00:00+03:00',
  means_of_contact: { email: ['marta@example.ee'], phone: ['+372123456'], mobile: ['+372987654'] },
  related_companies: [{ related_company_id: 30, related_company_name: 'Tutorial OÜ' }],
}

describe('scoro transformContact', () => {
  it('maps the documented person fields and parses with ContactSchema', () => {
    const contact = ContactSchema.parse(transformContact(PERSON))
    expect(contact).toMatchObject({
      id: '31',
      first_name: 'Marta',
      last_name: 'Tamm',
      name: 'Marta Tamm',
      email: 'marta@example.ee',
      phone: '+372123456',
      mobile: '+372987654',
      title: 'CEO',
      company_id: '30',
      owner_id: '1',
      created_at: '2023-01-15T09:30:00+02:00',
      updated_at: '2023-06-01T10:00:00+03:00',
    })
    expect(contact.metadata).toEqual(PERSON)
  })

  it('drops a date without an offset (site timezone is unstated)', () => {
    const contact = ContactSchema.parse(
      transformContact({ ...PERSON, modified_date: '2012-09-28 15:30:00' }),
    )
    expect(contact.updated_at).toBeUndefined()
  })

  it('reads the documented "+0000" offset form as +00:00', () => {
    // "Date and time values are of the form YYYY-MM-DDTHH:MM:SS+0000."
    const contact = ContactSchema.parse(
      transformContact({ ...PERSON, modified_date: '2012-09-28T15:30:00+0000' }),
    )
    expect(contact.updated_at).toBe('2012-09-28T15:30:00+00:00')
  })

  it('skips non-string means_of_contact elements instead of returning an object', () => {
    // The contacts/modify example shows { "value": ..., "is_default": 1 }
    // elements; the response shape for them is undocumented, so only strings
    // are read.
    const raw = {
      ...PERSON,
      means_of_contact: {
        email: [{ value: 'x@example.ee', is_default: 1 }, 'marta@example.ee'],
        phone: [{ value: '+3721', is_default: 1 }],
      },
    }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.email).toBe('marta@example.ee')
    expect(contact.phone).toBeUndefined()
  })

  it('drops an email the canonical schema would reject (documented example "someemail.com")', () => {
    const raw = { ...PERSON, means_of_contact: { email: ['someemail.com'] } }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.email).toBeUndefined()
  })

  it('handles null means_of_contact and related_companies', () => {
    const raw = {
      contact_id: 32,
      name: 'Jaan',
      contact_type: 'person',
      means_of_contact: null,
      related_companies: null,
    }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.id).toBe('32')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
  })

  it('throws instead of inventing an id', () => {
    expect(() => transformContact({ name: 'No id' })).toThrow(/no id/)
  })

  it('untransformContact keeps its (unrebuilt) write shape', () => {
    expect(untransformContact({ first_name: 'Jaan', company_id: '20' })).toEqual({
      firstname: 'Jaan',
      company_id: '20',
    })
  })
})
