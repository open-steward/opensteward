/**
 * Accounts raw data (`x-raw-data: 1`, Record_Raw_Details in
 * WebservicePremium.json) with the Accounts field names of YetiForce's
 * install schema.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawYetiForceAccount,
} from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/company'

function makeRaw(overrides: RawYetiForceAccount = {}): RawYetiForceAccount {
  return {
    id: 117,
    accountname: 'Driving school',
    website: 'https://www.driving.example/contact',
    phone: '+48 22 000 00 00',
    industry: 'Education',
    employees: 50,
    assigned_user_id: 1,
    createdtime: '2014-09-24 20:51:12',
    modifiedtime: '2014-09-25 08:00:00',
    ...overrides,
  }
}

describe('yetiforce transformCompany', () => {
  it('maps the documented fields and parses as a canonical Company', () => {
    const c = CompanySchema.parse(transformCompany('117', makeRaw(), 'UTC'))
    expect(c).toMatchObject({
      id: '117',
      name: 'Driving school',
      domain: 'www.driving.example',
      phone: '+48 22 000 00 00',
      industry: 'Education',
      size: 50,
      owner_id: '1',
      created_at: '2014-09-24T20:51:12.000Z',
      updated_at: '2014-09-25T08:00:00.000Z',
    })
  })

  it('reads a website without a scheme as a host', () => {
    expect(transformCompany('117', makeRaw({ website: 'driving.example' }), 'UTC').domain).toBe(
      'driving.example',
    )
  })

  it('reads employees sent as a numeric string', () => {
    expect(transformCompany('117', makeRaw({ employees: '12' }), 'UTC').size).toBe(12)
  })

  it('throws instead of inventing a name when accountname is missing', () => {
    expect(() => transformCompany('117', makeRaw({ accountname: undefined }), 'UTC')).toThrow(
      /accountname/,
    )
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany('117', raw, 'UTC').metadata).toBe(raw)
  })
})

describe('yetiforce untransformCompany', () => {
  it('maps name to accountname', () => {
    expect(untransformCompany({ name: 'YF Corp' }).accountname).toBe('YF Corp')
  })
})
