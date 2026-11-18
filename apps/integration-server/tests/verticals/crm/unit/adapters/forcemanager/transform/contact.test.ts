import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/forcemanager/transform/contact'
import { CONTACT, CONTACTS } from '../fixtures'

describe('forcemanager transformContact (documented GET /contacts/{ID} example)', () => {
  const out = transformContact(CONTACT)

  it('parses with the canonical schema', () => {
    expect(() => ContactSchema.parse(out)).not.toThrow()
    expect(() => ContactSchema.parse(transformContact(CONTACTS[0]!))).not.toThrow()
  })

  it('maps the documented fields', () => {
    expect(out).toMatchObject({
      id: '287',
      first_name: 'John',
      last_name: 'Doe',
      name: 'John Doe',
      email: 'j.doe@email.com',
      phone: '+39 687-9234',
      company_id: '1',
      owner_id: '310',
      address: { line1: '2765 Smith Street', city: 'St. Louis', region: 'MO', postalCode: '63124' },
      created_at: '2021-12-16T14:05:53.027Z',
    })
  })

  it('leaves the country out: countryId.value is a name, not ISO 3166-1', () => {
    expect(out.address?.country).toBeUndefined()
  })

  it('has no mobile: phone2 is a second phone, not a mobile', () => {
    expect(out.mobile).toBeUndefined()
  })

  it('reads null links and a null dateUpdated as absent', () => {
    expect(out.updated_at).toBeUndefined()
    const r = transformContact({ ...CONTACT, accountId: null, salesRepId: null })
    expect(r.company_id).toBeUndefined()
    expect(r.owner_id).toBeUndefined()
  })

  it('throws on a contact with no id rather than inventing one', () => {
    expect(() => transformContact({ ...CONTACT, id: null })).toThrow(/no id/)
  })

  it('keeps the raw payload as metadata', () => {
    expect(out.metadata).toBe(CONTACT)
  })

  it('untransform (write path, unchanged) still maps names', () => {
    expect(untransformContact({ first_name: 'A' })).toEqual({ firstName: 'A' })
  })
})
