import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/sage-crm/transform/contact'
import { person } from '../fixtures/documented'

describe('sage-crm transformContact (documented Person)', () => {
  it('maps the documented Person fields and parses as a canonical Contact', () => {
    const raw = person(55)
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact).toMatchObject({
      id: '55',
      first_name: 'Jim',
      last_name: 'Browne 55',
      name: 'Jim Browne 55',
      email: 'jim.browne@gatecom.example',
      phone: '44 20 7946 0000',
      title: 'Purchasing Manager',
      company_id: '41',
      owner_id: '4',
      created_at: '2019-08-24T14:15:22.000Z',
      updated_at: '2019-08-25T09:00:00.000Z',
    })
    expect(contact.metadata).toEqual(raw)
  })

  it('takes the address whose Addr_AddressId is Pers_PrimaryAddressId, without an undocumented country', () => {
    const contact = ContactSchema.parse(transformContact(person(7)))
    expect(contact.address).toEqual({
      line1: '1 Main Street',
      line2: 'Floor 2',
      city: 'London',
      region: 'Greater London',
      postalCode: 'EC1A 1BB',
    })
  })

  it('leaves email and phone unset when the record holds several and names no primary', () => {
    const raw = {
      ...person(8),
      Email: [{ Emai_EmailAddress: 'a@x.example' }, { Emai_EmailAddress: 'b@x.example' }],
      Phone: [{ Phon_number: '1' }, { Phon_number: '2' }],
    }
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
  })

  it('throws when Pers_PersonId is missing rather than inventing an id', () => {
    const { Pers_PersonId: _omit, ...raw } = person(1)
    expect(() => transformContact(raw)).toThrow(/Pers_PersonId/)
  })

  it('rejects a Pers_PersonId that is not the documented integer/int32 key', () => {
    // Spec components.schemas.Person: Pers_PersonId is type integer, format int32.
    // A string key is what an upstream that ignores the documented type would send.
    const stringKey = { ...person(1), Pers_PersonId: '42' } as unknown as ReturnType<typeof person>
    expect(() => transformContact(stringKey)).toThrow(/Pers_PersonId/)
    expect(() => transformContact({ ...person(1), Pers_PersonId: 42.5 })).toThrow(/Pers_PersonId/)
  })

  it('untransform keeps its previous (write-path) mapping', () => {
    expect(untransformContact({ first_name: 'Emma', company_id: '9' })).toEqual({
      pers_firstname: 'Emma',
      comp_companyid: 9,
    })
  })
})
