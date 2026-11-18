import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/folk/transform/contact'
import { documentedPerson } from '../fixtures/documented'

describe('folk transformContact (documented Person)', () => {
  it('maps the documented example and satisfies the canonical schema', () => {
    const raw = documentedPerson()
    const result = ContactSchema.parse(transformContact(raw))
    expect(result).toMatchObject({
      id: 'per_183ed5cc-3182-45de-84d1-d520f2604810',
      first_name: 'John',
      last_name: 'Doe',
      name: 'John Doe',
      // "The first email address in the list is the person's primary email address."
      email: 'john@example.com',
      // "The first phone number in the list is the person's primary phone number."
      phone: '+1234567890',
      title: 'Software Engineer',
      // "The first company in the list is the person's primary company."
      company_id: 'com_92346499-30bf-4278-ae8e-4aa3ae2ace2c',
      created_at: '2021-01-01T00:00:00.000Z',
    })
    expect(result.metadata).toEqual(raw)
  })

  it('leaves primary fields absent when the documented arrays are empty', () => {
    const raw = { ...documentedPerson(), emails: [], phones: [], companies: [], createdAt: null }
    const result = ContactSchema.parse(transformContact(raw))
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.created_at).toBeUndefined()
  })

  it('treats empty documented name strings as absent', () => {
    const raw = { ...documentedPerson(), firstName: '', lastName: '', fullName: '', jobTitle: '' }
    const result = ContactSchema.parse(transformContact(raw))
    expect(result.first_name).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.title).toBeUndefined()
  })

  it('untransformContact maps firstName/lastName', () => {
    const result = untransformContact({ first_name: 'A', last_name: 'B' })
    expect(result.firstName).toBe('A')
    expect(result.lastName).toBe('B')
  })
})
