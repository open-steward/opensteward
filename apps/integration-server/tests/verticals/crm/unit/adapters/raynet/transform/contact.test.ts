import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/raynet/transform/contact'
import { PERSON } from '../fixtures'

describe('raynet transformContact (GET /person/ documented example)', () => {
  it('maps the documented fields and parses as a canonical Contact', () => {
    const c = ContactSchema.parse(transformContact(PERSON))
    expect(c).toMatchObject({
      id: '3',
      first_name: 'Peter',
      last_name: 'Smart',
      name: 'Peter Smart',
      email: 'support@domain.rnt',
      phone: '+420 553 401 547',
      mobile: '+420 553 401 547',
      title: 'Consultant',
      company_id: '1',
      owner_id: '2',
      tags: [],
      address: { line1: '1768 Steel Rd', city: 'Ostrava', postalCode: '703 00', country: 'CZ' },
      created_at: '2022-06-18T11:19:00.000Z',
      updated_at: '2022-09-06T07:43:00.000Z',
    })
    expect(c.metadata).toEqual(PERSON)
  })

  it('reads mobile only from a phone typed mobile', () => {
    const landline = { ...PERSON, contactInfo: { ...PERSON.contactInfo, tel1Type: 'landline' } }
    const c = ContactSchema.parse(transformContact(landline))
    expect(c.phone).toBe('+420 553 401 547')
    expect(c.mobile).toBeUndefined()
  })

  it('reads mobile from tel2 when that is the phone typed mobile', () => {
    const c = ContactSchema.parse(
      transformContact({
        ...PERSON,
        contactInfo: {
          ...PERSON.contactInfo,
          tel1Type: 'landline',
          tel2: '+420 777 000 111',
          tel2Type: 'mobile',
        },
      }),
    )
    expect(c.phone).toBe('+420 553 401 547')
    expect(c.mobile).toBe('+420 777 000 111')
  })

  it('leaves unattached contacts without a company', () => {
    const c = ContactSchema.parse(transformContact({ ...PERSON, primaryRelationship: null }))
    expect(c.company_id).toBeUndefined()
    expect(c.title).toBeUndefined()
  })

  it('untransforms back to platform shape', () => {
    expect(untransformContact({ first_name: 'Ann' }).firstName).toBe('Ann')
  })
})
