import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawGoldVisionContact,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/contact'

function makeRaw(overrides: Partial<RawGoldVisionContact> = {}): RawGoldVisionContact {
  return { id: 1, ...overrides }
}

describe('gold-vision transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformContact(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps firstName to first_name', () => {
    expect(transformContact(makeRaw({ firstName: 'John' })).first_name).toBe('John')
  })

  it('returns undefined first_name when absent', () => {
    expect(transformContact(makeRaw({ firstName: undefined })).first_name).toBeUndefined()
  })

  it('maps lastName to last_name', () => {
    expect(transformContact(makeRaw({ lastName: 'Doe' })).last_name).toBe('Doe')
  })

  it('returns undefined last_name when absent', () => {
    expect(transformContact(makeRaw({ lastName: undefined })).last_name).toBeUndefined()
  })

  it('combines firstName and lastName into name', () => {
    const result = transformContact(makeRaw({ firstName: 'John', lastName: 'Doe' }))
    expect(result.name).toBe('John Doe')
  })

  it('returns only firstName as name when lastName absent', () => {
    expect(transformContact(makeRaw({ firstName: 'John', lastName: undefined })).name).toBe('John')
  })

  it('returns only lastName as name when firstName absent', () => {
    expect(transformContact(makeRaw({ firstName: undefined, lastName: 'Doe' })).name).toBe('Doe')
  })

  it('falls back to summary when no first or last name', () => {
    expect(
      transformContact(
        makeRaw({ summary: 'Jane Smith', firstName: undefined, lastName: undefined }),
      ).name,
    ).toBe('Jane Smith')
  })

  it('returns undefined name when nothing present', () => {
    expect(
      transformContact(makeRaw({ summary: undefined, firstName: undefined, lastName: undefined }))
        .name,
    ).toBeUndefined()
  })

  it('maps email through', () => {
    expect(transformContact(makeRaw({ email: 'john@example.com' })).email).toBe('john@example.com')
  })

  it('returns undefined email when absent', () => {
    expect(transformContact(makeRaw({ email: undefined })).email).toBeUndefined()
  })

  it('maps phone through', () => {
    expect(transformContact(makeRaw({ phone: '555-1234' })).phone).toBe('555-1234')
  })

  it('returns undefined phone when absent', () => {
    expect(transformContact(makeRaw({ phone: undefined })).phone).toBeUndefined()
  })

  it('maps mobile through', () => {
    expect(transformContact(makeRaw({ mobile: '555-9876' })).mobile).toBe('555-9876')
  })

  it('returns undefined mobile when absent', () => {
    expect(transformContact(makeRaw({ mobile: undefined })).mobile).toBeUndefined()
  })

  it('maps jobTitle to title', () => {
    expect(transformContact(makeRaw({ jobTitle: 'Engineer' })).title).toBe('Engineer')
  })

  it('returns undefined title when absent', () => {
    expect(transformContact(makeRaw({ jobTitle: undefined })).title).toBeUndefined()
  })

  it('maps accountId to company_id string', () => {
    expect(transformContact(makeRaw({ accountId: 10 })).company_id).toBe('10')
  })

  it('returns undefined company_id when absent', () => {
    expect(transformContact(makeRaw({ accountId: undefined })).company_id).toBeUndefined()
  })

  it('maps ownerId to owner_id string', () => {
    expect(transformContact(makeRaw({ ownerId: 5 })).owner_id).toBe('5')
  })

  it('returns undefined owner_id when absent', () => {
    expect(transformContact(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
  })

  it('returns undefined tags', () => {
    expect(transformContact(makeRaw()).tags).toBeUndefined()
  })

  it('returns undefined stage', () => {
    expect(transformContact(makeRaw()).stage).toBeUndefined()
  })

  it('returns undefined address', () => {
    expect(transformContact(makeRaw()).address).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision untransformContact', () => {
  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'John' })).toMatchObject({ firstName: 'John' })
  })

  it('maps last_name to lastName', () => {
    expect(untransformContact({ last_name: 'Doe' })).toMatchObject({ lastName: 'Doe' })
  })

  it('maps email to email', () => {
    expect(untransformContact({ email: 'john@example.com' })).toMatchObject({
      email: 'john@example.com',
    })
  })

  it('maps phone to phone', () => {
    expect(untransformContact({ phone: '555-1234' })).toMatchObject({ phone: '555-1234' })
  })

  it('maps mobile to mobile', () => {
    expect(untransformContact({ mobile: '555-9876' })).toMatchObject({ mobile: '555-9876' })
  })

  it('maps title to jobTitle', () => {
    expect(untransformContact({ title: 'Engineer' })).toMatchObject({ jobTitle: 'Engineer' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformContact({ company_id: '10' })).toMatchObject({ accountId: '10' })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformContact({ owner_id: '5' })).toMatchObject({ ownerId: '5' })
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
