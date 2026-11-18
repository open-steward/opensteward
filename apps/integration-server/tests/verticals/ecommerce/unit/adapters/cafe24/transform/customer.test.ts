/**
 * Cafe24 customer information → canonical Customer.
 *
 * Fixture: the documented example of GET /api/v2/admin/customersprivacy
 * (https://apidocs.cafe24.com/en/docs/admin/get-customersprivacy), first row,
 * including the personal fields the transform must NOT copy.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCafe24Customer,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

const documented = {
  shop_no: 1,
  member_id: 'sampleid',
  name: 'John Doe',
  name_english: 'John Doe',
  name_phonetic: 'John Doe',
  phone: '02-0000-0000',
  cellphone: '010-000-0000',
  email: 'sample@sample.com',
  wedding_anniversary: '2018-06-20',
  birthday: '2018-06-20',
  solar_calendar: 'T',
  total_points: '0.00',
  available_points: '0.00',
  used_points: '0.00',
  city: 'Seoul',
  state: 'Sindaebang dong Dongjak-gu',
  address1: 'Sindaebang dong Dongjak-gu, Seoul, Republic of Korea',
  address2: 'Professional Construction Hall',
  group_no: 1,
  job: 'self-employment',
  job_class: 'service',
  zipcode: '07071',
  created_date: '2018-01-18T11:19:27+09:00',
  member_authentication: 'T',
  use_blacklist: 'F',
  blacklist_type: '',
  last_login_date: '2018-01-18T11:19:27+09:00',
  member_authority: 'C',
  country_code: 'KR',
  refund_bank_code: 'bank_02',
  refund_bank_account_no: '1234-1234-1234567',
  refund_bank_account_holder: 'John Doe',
} satisfies RawCafe24Customer & Record<string, unknown>

describe('transformCustomer (cafe24 customersprivacy)', () => {
  it('maps the documented example and parses with CustomerSchema', () => {
    const c = CustomerSchema.parse(transformCustomer(documented))
    expect(c).toEqual({
      id: 'sampleid',
      email: 'sample@sample.com',
      phone: '010-000-0000',
      createdAt: '2018-01-18T02:19:27.000Z',
      defaultAddress: {
        line1: 'Sindaebang dong Dongjak-gu, Seoul, Republic of Korea',
        line2: 'Professional Construction Hall',
        city: 'Seoul',
        region: 'Sindaebang dong Dongjak-gu',
        postalCode: '07071',
        country: 'KR',
      },
      metadata: {
        memberId: 'sampleid',
        shopNo: 1,
        name: 'John Doe',
        officePhone: '02-0000-0000',
        groupNo: 1,
        lastLoginDate: '2018-01-18T02:19:27.000Z',
      },
    })
  })

  it('does not split the single documented name on a guess', () => {
    const c = transformCustomer(documented)
    expect(c.firstName).toBeUndefined()
    expect(c.lastName).toBeUndefined()
  })

  it('copies no refund bank account or other personal field into metadata', () => {
    const json = JSON.stringify(transformCustomer(documented))
    expect(json).not.toContain('1234-1234-1234567')
    expect(json).not.toContain('bank_02')
    expect(json).not.toContain('2018-06-20')
  })

  it('omits what a sparse row does not carry', () => {
    const c = CustomerSchema.parse(transformCustomer({ member_id: 'm2' }))
    expect(c).toEqual({ id: 'm2', metadata: { memberId: 'm2' } })
  })
})

describe('untransformCustomer (cafe24)', () => {
  it('writes email, combined name and mobile', () => {
    const body = untransformCustomer({
      email: 'jisu@example.kr',
      firstName: 'Kim',
      lastName: 'Jisu',
      phone: '010-9876-5432',
    })
    expect(body.email).toBe('jisu@example.kr')
    expect(body.name).toBe('Kim Jisu')
    expect(body.mobile).toBe('010-9876-5432')
  })
})
