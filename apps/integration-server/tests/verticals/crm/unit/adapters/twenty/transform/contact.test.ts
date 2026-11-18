import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawTwentyPerson,
} from '../../../../../../../src/verticals/crm/adapters/twenty/transform/contact'
import { PERSON } from '../fixtures'

describe('twenty transformContact (Person)', () => {
  it('maps a documented Person record to a schema-valid Contact', () => {
    const out = ContactSchema.parse(transformContact(PERSON))
    expect(out).toMatchObject({
      id: PERSON.id,
      first_name: 'Christoph',
      last_name: 'Callisto',
      name: 'Christoph Callisto',
      email: 'christoph.calisto@linkedin.com',
      phone: '789012345',
      title: 'CEO',
      company_id: PERSON.companyId,
      created_at: PERSON.createdAt,
      updated_at: PERSON.updatedAt,
    })
    expect(out.metadata).toEqual(PERSON)
  })

  it('treats the empty composite sub-fields Twenty stores as absent', () => {
    const raw: RawTwentyPerson = {
      ...PERSON,
      name: { firstName: '', lastName: '' },
      emails: { primaryEmail: '', additionalEmails: null },
      phones: { ...PERSON.phones, primaryPhoneNumber: '' },
      jobTitle: '',
      companyId: null,
    }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.name).toBeUndefined()
    expect(out.first_name).toBeUndefined()
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.title).toBeUndefined()
    expect(out.company_id).toBeUndefined()
  })

  it('refuses a record without an id', () => {
    expect(() => transformContact({ ...PERSON, id: undefined })).toThrow(/id/)
  })

  it('untransforms canonical Contact to Twenty person shape', () => {
    const out = untransformContact({
      first_name: 'Lucas',
      last_name: 'Bernard',
      email: 'lucas@example.fr',
      phone: '+33698765432',
      company_id: 'company-99',
    })
    expect((out.name as Record<string, string>).firstName).toBe('Lucas')
    expect((out.name as Record<string, string>).lastName).toBe('Bernard')
    expect((out.emails as Record<string, string>).primaryEmail).toBe('lucas@example.fr')
    expect((out.phones as Record<string, string>).primaryPhoneNumber).toBe('+33698765432')
    expect(out.companyId).toBe('company-99')
  })
})
