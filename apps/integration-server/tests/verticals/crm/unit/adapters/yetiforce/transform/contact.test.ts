/**
 * Contacts raw data as RecordsList returns it with `x-raw-data: 1`
 * (Record_Raw_Details, WebservicePremium.json: "Record data in the system
 * format as stored in a database", example
 * `{ "id": 11, "assigned_user_id": 1, "createdtime": "2014-09-24 20:51:12" }`),
 * with the Contacts field names of YetiForce's install schema.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawYetiForceContact,
} from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/contact'

function makeRaw(overrides: RawYetiForceContact = {}): RawYetiForceContact {
  return {
    id: 11,
    firstname: 'Tom',
    lastname: 'Kowalski',
    email: 'tom@example.com',
    phone: '+48 22 123 45 67',
    mobile: '+48 600 000 000',
    jobtitle: 'Buyer',
    parent_id: 117,
    assigned_user_id: 1,
    createdtime: '2014-09-24 20:51:12',
    modifiedtime: '2014-09-25 08:00:00',
    ...overrides,
  }
}

describe('yetiforce transformContact', () => {
  it('maps the documented fields and parses as a canonical Contact', () => {
    const c = ContactSchema.parse(transformContact('11', makeRaw(), 'UTC'))
    expect(c).toMatchObject({
      id: '11',
      first_name: 'Tom',
      last_name: 'Kowalski',
      email: 'tom@example.com',
      phone: '+48 22 123 45 67',
      mobile: '+48 600 000 000',
      title: 'Buyer',
      owner_id: '1',
      created_at: '2014-09-24T20:51:12.000Z',
      updated_at: '2014-09-25T08:00:00.000Z',
    })
  })

  it('reads datetimes in the raw time zone the login reported', () => {
    const c = transformContact('11', makeRaw(), 'Europe/Warsaw')
    expect(c.created_at).toBe('2014-09-24T18:51:12.000Z')
  })

  it('does not treat parent_id as a company id: it may be a Lead, Vendor, Partner or Competitor', () => {
    expect(transformContact('11', makeRaw(), 'UTC').company_id).toBeUndefined()
  })

  it('leaves empty fields and an empty owner out', () => {
    const c = ContactSchema.parse(
      transformContact('12', { id: 12, firstname: '', assigned_user_id: 0 }, 'UTC'),
    )
    expect(c.first_name).toBeUndefined()
    expect(c.owner_id).toBeUndefined()
  })

  it('does not fall back from phone to mobile', () => {
    expect(transformContact('11', makeRaw({ phone: '' }), 'UTC').phone).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact('11', raw, 'UTC').metadata).toBe(raw)
  })
})

describe('yetiforce untransformContact', () => {
  it('maps first_name to firstname', () => {
    expect(untransformContact({ first_name: 'Yeti' }).firstname).toBe('Yeti')
  })
})
