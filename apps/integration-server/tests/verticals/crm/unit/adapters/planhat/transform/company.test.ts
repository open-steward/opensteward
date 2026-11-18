import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawPlanhatCompany,
} from '../../../../../../../src/verticals/crm/adapters/planhat/transform/company'

// Fields from the "Get Companies by ID" example response at
// https://www.planhat.com/developers/api/company (values verbatim).
const DOCUMENTED: RawPlanhatCompany = {
  _id: '61006bc89a3e0b702ed8ea49',
  domains: ['stjohns.k12.fl.us'],
  tags: [],
  owner: '60ccb1c5965cc9e0f3848075',
  name: 'Tenet',
  phase: 'Onboarding',
  status: 'prospect',
  createDate: '2021-07-27T20:25:44.430Z',
  lastUpdated: '2021-08-11T16:12:41.657Z',
  updatedAt: '2021-08-09T16:54:17.298Z',
}

// First record of the "Get Companies List" example: "owner":null.
const LISTED: RawPlanhatCompany = {
  _id: '61002458cb43626b3a7fb186',
  domains: ['https://google.lv', 'https://draugiem.lv'],
  tags: ['test', 'test2'],
  owner: null,
  coOwner: null,
  name: 'Altus',
}

describe('planhat transformCompany', () => {
  it('parses the documented get-by-id example with the canonical schema', () => {
    const c = CompanySchema.parse(transformCompany(DOCUMENTED))
    expect(c.id).toBe('61006bc89a3e0b702ed8ea49')
    expect(c.name).toBe('Tenet')
    expect(c.owner_id).toBe('60ccb1c5965cc9e0f3848075')
    expect(c.created_at).toBe('2021-07-27T20:25:44.430Z')
    expect(c.updated_at).toBe('2021-08-09T16:54:17.298Z')
  })

  it('parses the documented list example, where owner is null', () => {
    const c = CompanySchema.parse(transformCompany(LISTED))
    expect(c.owner_id).toBeUndefined()
    expect(c.tags).toEqual(['test', 'test2'])
  })

  it('maps phone from the documented phonePrimary', () => {
    expect(transformCompany({ ...LISTED, phonePrimary: '+46 8 123 45' }).phone).toBe('+46 8 123 45')
  })

  it('does not read the undocumented domain, phone, ownerId, employees or createdAt', () => {
    const c = transformCompany({
      ...LISTED,
      domain: 'x.com',
      phone: '1',
      ownerId: 'u1',
      employees: 10,
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    expect(c.domain).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.owner_id).toBeUndefined()
    expect(c.size).toBeUndefined()
    expect(c.created_at).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformCompany(DOCUMENTED).metadata).toBe(DOCUMENTED)
  })
})

describe('planhat untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })
})
