import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawSpiroContact,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { CONTACTS_LIST, CONTACT_GET } from '../fixtures'

const LISTED: RawSpiroContact = CONTACTS_LIST.data[0]

describe('spiro transformContact (documented GET /api/v1/contacts example)', () => {
  it('parses against ContactSchema with every documented field in place', () => {
    const c = ContactSchema.parse(transformContact(LISTED))
    expect(c).toMatchObject({
      id: '208',
      first_name: 'Charles',
      last_name: 'Howell',
      email: 'charles@armstrong.test',
      phone: '303.165.1111',
      mobile: '731.348.1560',
      title: 'agriculturist',
      company_id: '441',
      owner_id: '998',
      created_at: '2026-09-01T09:57:38.521Z',
      updated_at: '2026-09-01T09:57:38.521Z',
    })
    expect(c.metadata).toEqual(LISTED)
  })

  it('reads the GET-by-id document the same way', () => {
    const c = ContactSchema.parse(transformContact(CONTACT_GET.data))
    expect(c.id).toBe('209')
    expect(c.company_id).toBe('442')
    expect(c.owner_id).toBe('999')
  })

  it('composes no display name Spiro did not send', () => {
    expect(transformContact(LISTED).name).toBeUndefined()
  })

  it('leaves company and owner unset when the relationships are empty', () => {
    const c = transformContact({
      ...LISTED,
      relationships: { company: { data: null }, user: { data: null } },
    })
    ContactSchema.parse(c)
    expect(c.company_id).toBeUndefined()
    expect(c.owner_id).toBeUndefined()
  })
})

describe('spiro untransformContact', () => {
  it('maps mobile back to mobile_phone', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    expect(result.mobile_phone).toBe('+14155550199')
  })

  it('maps company_id back to company_id', () => {
    const result = untransformContact({ company_id: '99' })
    expect(result.company_id).toBe('99')
  })

  it('maps owner_id back to owner_id', () => {
    const result = untransformContact({ owner_id: '5' })
    expect(result.owner_id).toBe('5')
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
