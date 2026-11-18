import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawGainsightCompanyPerson,
  type RawGainsightPerson,
} from '../../../../../../../src/verticals/crm/adapters/gainsight/transform/contact'

/**
 * `data` of the documented "Get Person API with GSID" sample success response,
 * verbatim (https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Person_API/People_API_Documentation),
 * with the nested relationships array trimmed.
 */
function documentedPerson(): RawGainsightPerson {
  return {
    email: 'jsmith@abc.com',
    createddate: '2018-06-05T12:03:16.417',
    firstname: 'John',
    timezone: null,
    dynamicresolutionkey: null,
    modifieddate: '2018-06-05T12:03:16.417',
    name: 'John Smith',
    lastname: 'smith',
    externalrecordid__gc: null,
    masterrecordid: null,
    middlename: null,
    masteravatartypecode: null,
    location: 'United States',
    gsid: '1P04AB23JMJA97MWFYJM8PQO1KQTAYV5MXJ1',
    companies: [
      {
        modifieddate: '2018-06-05T12:04:10.81',
        company_id: { Id: '1P04QNK6ENCURXXDZW9WWWWWWWWWWTZCAAAA', name: 'abc, Inc.' },
        gsid: '1C01KDEEJ1EH9CQP5LE79JLEPK9AH63AKWS1',
        active: true,
        isprimarycompany: null,
        role: '1I0054U9FAKXZ0H26H4PSEVL0V2MP7H680C4',
        manager: null,
        createddate: '2018-06-05T12:04:10.81',
        person_id: { Id: '1P04AB23JMJA97MWFYJM8PQO1KQTAYV5MXJ1', name: 'John Smith' },
        title: 'Executive Sponsor',
      },
    ],
  }
}

function companyPerson(
  id: string,
  title: string,
  isprimarycompany: boolean | null,
): RawGainsightCompanyPerson {
  return { company_id: { Id: id, name: id }, title, isprimarycompany }
}

describe('gainsight transformContact (documented Get Person response)', () => {
  it('maps the documented sample and satisfies ContactSchema', () => {
    const raw = documentedPerson()
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact).toEqual({
      id: '1P04AB23JMJA97MWFYJM8PQO1KQTAYV5MXJ1',
      first_name: 'John',
      last_name: 'smith',
      name: 'John Smith',
      email: 'jsmith@abc.com',
      title: 'Executive Sponsor',
      company_id: '1P04QNK6ENCURXXDZW9WWWWWWWWWWTZCAAAA',
      metadata: raw,
    })
  })

  it('keeps the raw record by reference in metadata', () => {
    const raw = documentedPerson()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('does not derive timestamps from the offset-less createddate/modifieddate', () => {
    const contact = transformContact(documentedPerson())
    expect(contact.created_at).toBeUndefined()
    expect(contact.updated_at).toBeUndefined()
  })

  it('maps no phone: the Person object documents none', () => {
    expect(transformContact({ ...documentedPerson(), Phone: '+1' }).phone).toBeUndefined()
  })

  it('maps documented nulls to undefined', () => {
    const contact = ContactSchema.parse(
      transformContact({
        gsid: 'g-1',
        email: null,
        firstname: null,
        lastname: null,
        name: null,
        companies: null,
      }),
    )
    expect(contact.first_name).toBeUndefined()
    expect(contact.last_name).toBeUndefined()
    expect(contact.name).toBeUndefined()
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.title).toBeUndefined()
  })

  it('throws instead of inventing an id when gsid is missing', () => {
    const { gsid: _gsid, ...rest } = documentedPerson()
    expect(() => transformContact(rest)).toThrow(/no gsid/)
  })

  it('ignores the PascalCase request-body keys', () => {
    expect(() => transformContact({ Gsid: 'x', Email: 'a@b.c' })).toThrow(/no gsid/)
  })

  describe('company_id / title from the Company Person association', () => {
    it('uses the association flagged isprimarycompany', () => {
      const contact = transformContact({
        gsid: 'g-1',
        companies: [companyPerson('c-a', 'Buyer', false), companyPerson('c-b', 'Sponsor', true)],
      })
      expect(contact.company_id).toBe('c-b')
      expect(contact.title).toBe('Sponsor')
    })

    it('picks none when several associations have no primary flag', () => {
      const contact = transformContact({
        gsid: 'g-1',
        companies: [companyPerson('c-a', 'Buyer', null), companyPerson('c-b', 'Sponsor', null)],
      })
      expect(contact.company_id).toBeUndefined()
      expect(contact.title).toBeUndefined()
    })

    it('is undefined without associations', () => {
      const contact = transformContact({ gsid: 'g-1', companies: [] })
      expect(contact.company_id).toBeUndefined()
    })
  })
})

describe('gainsight untransformContact', () => {
  it('maps email to "Email"', () => {
    expect(untransformContact({ email: 'dave@example.com' }).Email).toBe('dave@example.com')
  })

  it('maps first_name to "FirstName"', () => {
    expect(untransformContact({ first_name: 'Dave' }).FirstName).toBe('Dave')
  })

  it('maps last_name to "LastName"', () => {
    expect(untransformContact({ last_name: 'Brown' }).LastName).toBe('Brown')
  })

  it('maps phone to "Phone"', () => {
    expect(untransformContact({ phone: '+1-555-0177' }).Phone).toBe('+1-555-0177')
  })

  it('maps title to "Title"', () => {
    expect(untransformContact({ title: 'Director' }).Title).toBe('Director')
  })
})
