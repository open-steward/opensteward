import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawSalesmateContact,
} from '../../../../../../../src/verticals/crm/adapters/salesmate/transform/contact'

/**
 * Trimmed from the documented "Get a Contact" example response
 * (GET https://link_name.salesmate.io/apis/contact/v4/{{Contact.id}} → Data),
 * https://apidocs.salesmate.io/ — values verbatim, unused fields dropped.
 */
function documentedContact(): RawSalesmateContact {
  return {
    id: 40,
    name: 'Chaitali updated Chouhan',
    mobile: '',
    company: {
      id: 38,
      name: 'test company',
      owner: { id: 1, name: 'Sweta Kumari', firstName: 'Sweta', lastName: 'Kumari' },
    },
    email: '',
    designation: '',
    owner: {
      id: 1,
      name: 'Sweta Kumari',
      firstName: 'Sweta',
      lastName: 'Kumari',
      email: 'sweta.kumari@rapidops.com',
      mobile: '9893470215',
    },
    phone: '',
    currency: { code: 'USD', rate: '1.00', symbol: '$' },
    createdAt: '2020-08-21T11:51:34.000Z',
    lastModifiedAt: '2023-07-14T07:15:38.000Z',
    isDeleted: false,
    firstName: 'Chaitali updated',
    lastName: 'Chouhan',
  }
}

describe('salesmate transformContact', () => {
  it('maps the documented Get a Contact response and passes ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(documentedContact()))
    expect(out).toMatchObject({
      id: '40',
      name: 'Chaitali updated Chouhan',
      first_name: 'Chaitali updated',
      last_name: 'Chouhan',
      company_id: '38',
      owner_id: '1',
      created_at: '2020-08-21T11:51:34.000Z',
      updated_at: '2023-07-14T07:15:38.000Z',
    })
  })

  it('drops the empty strings the docs show for unset email/phone/mobile/designation', () => {
    const out = ContactSchema.parse(transformContact(documentedContact()))
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.mobile).toBeUndefined()
    expect(out.title).toBeUndefined()
  })

  it('maps set email/phone/mobile/designation', () => {
    const out = ContactSchema.parse(
      transformContact({
        ...documentedContact(),
        email: 'email@domain.com',
        phone: '7047416978',
        mobile: '7878839370',
        designation: 'CEO',
      }),
    )
    expect(out).toMatchObject({
      email: 'email@domain.com',
      phone: '7047416978',
      mobile: '7878839370',
      title: 'CEO',
    })
  })

  it('reads lastModifiedAt (not updatedAt) as updated_at', () => {
    const raw = { ...documentedContact(), updatedAt: '2030-01-01T00:00:00.000Z' }
    expect(transformContact(raw).updated_at).toBe('2023-07-14T07:15:38.000Z')
  })

  it('throws on a record with no id instead of inventing one', () => {
    const raw = documentedContact()
    delete raw.id
    expect(() => transformContact(raw)).toThrow(/no id/)
  })

  it('keeps the raw record as metadata', () => {
    const raw = documentedContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  /**
   * The documented Search contacts example row, verbatim. It capitalises
   * "Owner" / "Company", unlike Get a Contact's lowercase owner / company. The
   * transform reads the lowercase fields only (no candidate-key chain), so a
   * row in this shape parses with owner_id / company_id absent, never guessed.
   */
  it('parses the documented Search contacts row, leaving the capitalised Owner unread', () => {
    const row = {
      id: 8,
      name: 'Benjamin Jobs',
      Owner: { id: 1, firstName: 'Admin', lastName: '', email: 'test@gmail.com', imagePath: '' },
      mobile: '7878839370',
      email: 'email@domain.com',
      designation: '',
      billingCity: 'Charlotte',
      tags: '',
      photo: '',
      imagePath: '',
      Company: {},
    }
    const out = ContactSchema.parse(transformContact(row))
    expect(out).toMatchObject({
      id: '8',
      name: 'Benjamin Jobs',
      mobile: '7878839370',
      email: 'email@domain.com',
    })
    expect(out.owner_id).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.title).toBeUndefined()
  })
})

describe('salesmate untransformContact', () => {
  it('maps canonical fields to Salesmate names', () => {
    expect(untransformContact({ first_name: 'A', last_name: 'B', email: 'a@b.c' })).toEqual({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
    })
  })
})
