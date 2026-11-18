/**
 * Fixtures are the GET /api/v1/contacts/{contact_id} and GET /api/v1/contacts
 * response examples (https://desk.zoho.com/DeskAPIDocument, Contacts).
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawZohoDeskContact,
} from '../../../../../../../src/verticals/customer-support/adapters/zoho-desk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema'

const GET_CONTACT: RawZohoDeskContact = {
  lastName: 'Lawrence',
  modifiedTime: '2016-05-04T09:57:17.000Z',
  ownerId: '1892000000042001',
  id: '1892000000042032',
  email: 'lawrence@zylker.com',
  mobile: null,
  accountId: '1892000000975382',
  firstName: 'Jennifer',
  phone: '1 888 900 9646',
}

describe('transformContact', () => {
  it('maps the documented get-contact example', () => {
    const c = ContactSchema.parse(transformContact(GET_CONTACT))
    expect(c).toEqual({
      id: '1892000000042032',
      externalId: '1892000000042032',
      email: 'lawrence@zylker.com',
      name: 'Jennifer Lawrence',
      phone: '1 888 900 9646',
      organizationId: '1892000000975382',
      platform: 'zoho-desk',
      metadata: {},
      raw: GET_CONTACT,
    })
  })

  it('uses mobile when phone is empty (list example)', () => {
    const c = ContactSchema.parse(
      transformContact({
        lastName: 'Case',
        mobile: '+91 8508569683',
        accountId: '1892000000091433',
        firstName: 'Jonathan',
        phone: null,
        id: '1892000000772003',
        email: 'case@zylker.com',
      }),
    )
    expect(c).toMatchObject({ name: 'Jonathan Case', phone: '+91 8508569683' })
  })

  it('drops an address the schema would reject and survives a bare row', () => {
    const c = ContactSchema.parse(
      transformContact({ id: '1', lastName: 'X', email: 'not-an-email' }),
    )
    expect(c.email).toBeUndefined()
    expect(ContactSchema.parse(transformContact({ id: 2 }))).toMatchObject({ id: '2', name: '' })
  })
})
