import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawTeamworkContact,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/contact'
import { CONTACT } from '../fixtures'

describe('teamwork-crm transformContact', () => {
  it('maps the documented Contact model to a canonical Contact', () => {
    const raw = { ...CONTACT } as RawTeamworkContact
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact).toMatchObject({
      id: '101',
      first_name: 'Aoife',
      last_name: "O'Brien",
      name: "Aoife O'Brien",
      email: 'aoife@acme.example',
      phone: '21 432 1000',
      company_id: '55',
      owner_id: '7',
      address: {
        line1: '1 Albert Quay',
        line2: 'Floor 3',
        city: 'Cork',
        region: 'Co. Cork',
        postalCode: 'T12 X8N6',
      },
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    expect(contact.address?.country).toBeUndefined()
    // `title` is documented only as a string, not as a job title.
    expect(contact.title).toBeUndefined()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('reads the emailAddresses and phoneNumbers entries flagged isMain', () => {
    const raw = {
      ...CONTACT,
      emailAddresses: [{ address: 'a@x.example', isMain: false }],
      phoneNumbers: [{ number: '1', isMain: false, code: null }],
    } as RawTeamworkContact
    const contact = transformContact(raw)
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
  })

  it('reads no main entry when isMain is null or absent', () => {
    const raw = {
      ...CONTACT,
      emailAddresses: [{ address: 'a@x.example', isMain: null }, { address: 'b@x.example' }],
      phoneNumbers: [{ number: '1', isMain: null, code: null }, { number: '2' }],
    } as RawTeamworkContact
    const contact = transformContact(raw)
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
  })

  it('maps empty relationships and address fields to absent values', () => {
    const raw = {
      ...CONTACT,
      company: null,
      owner: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateOrCounty: null,
      zipcode: null,
      emailAddresses: [],
      phoneNumbers: [],
    } as RawTeamworkContact
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.address).toBeUndefined()
  })

  it('refuses a model without an integer id', () => {
    expect(() =>
      transformContact({ ...CONTACT, id: undefined } as unknown as RawTeamworkContact),
    ).toThrow(/no integer id/)
  })

  it('untransforms canonical Contact to the write body', () => {
    const result = untransformContact({ first_name: 'Aoife', company_id: '50' })
    expect(result.firstName).toBe('Aoife')
    expect(result.companyId).toBe('50')
  })
})
