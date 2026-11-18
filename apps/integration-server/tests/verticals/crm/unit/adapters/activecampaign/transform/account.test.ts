import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformAccount,
  type RawActiveCampaignAccount,
} from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/account'

/**
 * Fixtures are the documented example responses:
 * - GET /accounts   https://developers.activecampaign.com/reference/list-all-accounts
 * - GET /accounts/:id https://developers.activecampaign.com/reference/retrieve-an-account
 * (`links` is written as an object here; the docs' example prints it with
 * array brackets around object members, which is not valid JSON.)
 */
const LISTED: RawActiveCampaignAccount = {
  name: 'First Example Account',
  accountUrl: null,
  createdTimestamp: '2019-04-29T07:51:31-05:00',
  updatedTimestamp: '2019-04-29T07:51:31-05:00',
  contactCount: '1',
  dealCount: '3',
  links: {
    notes: 'https://:account.api-us1.com/api/:version/accounts/1/notes',
    accountCustomFieldData:
      'https://:account.api-us1.com/api/:version/accounts/1/accountCustomFieldData',
    accountContacts: 'https://:account.api-us1.com/api/:version/accounts/1/accountContacts',
  },
  id: '1',
}

const RETRIEVED: RawActiveCampaignAccount = {
  name: 'Example Account',
  accountUrl: 'https://www.example.com',
  createdTimestamp: '2019-05-15T15:58:16-05:00',
  updatedTimestamp: '2019-05-15T15:58:16-05:00',
  links: [],
  id: '1',
}

describe('activecampaign transformAccount', () => {
  it('maps the documented list example and parses as a canonical Company', () => {
    const out = CompanySchema.parse(transformAccount(LISTED))
    expect(out.id).toBe('1')
    expect(out.name).toBe('First Example Account')
    expect(out.created_at).toBe('2019-04-29T12:51:31.000Z')
    expect(out.updated_at).toBe('2019-04-29T12:51:31.000Z')
    expect(out.domain).toBeUndefined()
    expect(out.metadata).toEqual(LISTED)
  })

  it('maps the documented retrieve example, taking domain from accountUrl', () => {
    const out = CompanySchema.parse(transformAccount(RETRIEVED))
    expect(out.id).toBe('1')
    expect(out.name).toBe('Example Account')
    expect(out.domain).toBe('www.example.com')
    expect(out.created_at).toBe('2019-05-15T20:58:16.000Z')
    expect(out.updated_at).toBe('2019-05-15T20:58:16.000Z')
  })

  it('omits domain when accountUrl is not a URL', () => {
    const out = CompanySchema.parse(transformAccount({ ...RETRIEVED, accountUrl: 'not a url' }))
    expect(out.domain).toBeUndefined()
  })

  it('reads no organization-era fields', () => {
    const out = transformAccount({
      ...RETRIEVED,
      accountUrl: null,
      orgurl: 'legacy.example',
      phone: '555',
    })
    expect(out.domain).toBeUndefined()
    expect(out.phone).toBeUndefined()
  })

  it('keeps the raw record by reference', () => {
    expect(transformAccount(RETRIEVED).metadata).toBe(RETRIEVED)
  })
})
