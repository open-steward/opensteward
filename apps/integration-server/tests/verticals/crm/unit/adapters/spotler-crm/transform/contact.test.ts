import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/contact'

describe('spotler-crm transformContact', () => {
  it('maps the documented id and keeps the record as metadata', () => {
    const raw = { id: 42, somefield: 'kept raw' }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.id).toBe('42')
    expect(contact.metadata).toEqual(raw)
  })

  it('maps no undocumented field', () => {
    const raw = {
      id: 42,
      firstname: 'James',
      surname: 'Smith',
      emailaddress: 'james@example.co.uk',
    }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.first_name).toBeUndefined()
    expect(contact.last_name).toBeUndefined()
    expect(contact.email).toBeUndefined()
  })

  it('untransforms contact data', () => {
    const out = untransformContact({ first_name: 'James', company_id: '10' })
    expect(out.firstname).toBe('James')
    expect(out.accountid).toBe(10)
  })
})
