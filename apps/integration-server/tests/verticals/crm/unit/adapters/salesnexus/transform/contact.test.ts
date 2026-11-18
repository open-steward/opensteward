import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawSalesnexusContact,
} from '../../../../../../../src/verticals/crm/adapters/salesnexus/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
// CONTACT_FIELDS constants (from ../constants.ts):
//   FIRST_NAME='49', LAST_NAME='50', FULL_NAME='48', EMAIL='133',
//   PHONE='51', MOBILE='52', TITLE='53', OWNER_ID='100',
//   CREATED_DATE='101', MODIFIED_DATE='102'

function makeRaw(fieldValues: Record<string, string> = {}): RawSalesnexusContact {
  return { 'contact-id': 'c-1', 'field-values': fieldValues }
}

describe('salesnexus transformContact', () => {
  it('maps contact-id to string id', () => {
    expect(transformContact(makeRaw()).id).toBe('c-1')
  })

  it('maps first_name and last_name from field IDs 49 and 50', () => {
    const result = transformContact(makeRaw({ '49': 'Alice', '50': 'Jones' }))
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBe('Jones')
  })

  it('joins first+last into name when full_name (48) absent', () => {
    const result = transformContact(makeRaw({ '49': 'Bob', '50': 'Smith' }))
    expect(result.name).toBe('Bob Smith')
  })

  it('prefers explicit full_name (field 48) over derived join', () => {
    const result = transformContact(
      makeRaw({ '48': 'Robert Smith III', '49': 'Bob', '50': 'Smith' }),
    )
    expect(result.name).toBe('Robert Smith III')
  })

  it('maps email from field 133', () => {
    expect(transformContact(makeRaw({ '133': 'bob@example.com' })).email).toBe('bob@example.com')
  })

  it('maps phone (51) and mobile (52)', () => {
    const result = transformContact(makeRaw({ '51': '+14155550001', '52': '+14155550002' }))
    expect(result.phone).toBe('+14155550001')
    expect(result.mobile).toBe('+14155550002')
  })

  it('maps title from field 53', () => {
    expect(transformContact(makeRaw({ '53': 'VP Sales' })).title).toBe('VP Sales')
  })

  it('maps owner_id from field 100', () => {
    expect(transformContact(makeRaw({ '100': 'u-99' })).owner_id).toBe('u-99')
  })

  it('coerces created_at (101) to ISO string', () => {
    const result = transformContact(makeRaw({ '101': '2024-01-15T09:30:00Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('returns undefined created_at for invalid date string', () => {
    expect(transformContact(makeRaw({ '101': 'not-a-date' })).created_at).toBeUndefined()
  })

  it('treats null/empty field-value as undefined', () => {
    const result = transformContact({ 'contact-id': 'c-2', 'field-values': { '49': null } })
    expect(result.first_name).toBeUndefined()
  })

  it('handles missing field-values map', () => {
    expect(() => transformContact({ 'contact-id': 'c-3' })).not.toThrow()
  })

  it('produces schema-valid output', () => {
    const raw: RawSalesnexusContact = {
      'contact-id': 'c-10',
      'field-values': {
        '49': 'Jane',
        '50': 'Doe',
        '133': 'jane@example.com',
        '51': '+15550001111',
        '101': '2024-06-01T00:00:00.000Z',
        '102': '2024-06-15T00:00:00.000Z',
      },
    }
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('salesnexus untransformContact', () => {
  it('maps first_name to field key 49', () => {
    expect(untransformContact({ first_name: 'Alice' })).toMatchObject({ '49': 'Alice' })
  })

  it('maps email to field key 133', () => {
    expect(untransformContact({ email: 'a@example.com' })).toMatchObject({ '133': 'a@example.com' })
  })

  it('omits unset fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('round-trips first_name through transform/untransform', () => {
    const raw = makeRaw({ '49': 'Charlie' })
    const contact = transformContact(raw)
    const back = untransformContact(contact)
    expect(back['49']).toBe('Charlie')
  })
})
