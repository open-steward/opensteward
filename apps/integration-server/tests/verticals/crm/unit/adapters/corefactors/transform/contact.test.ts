import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawCorefactorsContact,
} from '../../../../../../../src/verticals/crm/adapters/corefactors/transform/contact'

function makeRaw(overrides: Partial<RawCorefactorsContact> = {}): RawCorefactorsContact {
  return { ...overrides }
}

describe('transformContact', () => {
  describe('id coercion', () => {
    it('coerces numeric id to string', () => {
      const raw = makeRaw({ id: 42 })
      expect(transformContact(raw).id).toBe('42')
    })

    it('passes string id through', () => {
      const raw = makeRaw({ id: 'abc' })
      expect(transformContact(raw).id).toBe('abc')
    })

    it('returns empty string when id is missing', () => {
      const raw = makeRaw()
      expect(transformContact(raw).id).toBe('')
    })
  })

  describe('name construction', () => {
    it('joins first_name and last_name with a space', () => {
      const raw = makeRaw({ first_name: 'Alice', last_name: 'Jones' })
      expect(transformContact(raw).name).toBe('Alice Jones')
    })

    it('returns only first_name when last_name is absent', () => {
      const raw = makeRaw({ first_name: 'Alice' })
      expect(transformContact(raw).name).toBe('Alice')
    })

    it('returns only last_name when first_name is absent', () => {
      const raw = makeRaw({ last_name: 'Jones' })
      expect(transformContact(raw).name).toBe('Jones')
    })

    it('returns undefined when neither first_name nor last_name is present', () => {
      const raw = makeRaw()
      expect(transformContact(raw).name).toBeUndefined()
    })
  })

  describe('field mapping', () => {
    it('maps first_name', () => {
      const raw = makeRaw({ first_name: 'Alice' })
      expect(transformContact(raw).first_name).toBe('Alice')
    })

    it('maps last_name', () => {
      const raw = makeRaw({ last_name: 'Jones' })
      expect(transformContact(raw).last_name).toBe('Jones')
    })

    it('maps email', () => {
      const raw = makeRaw({ email: 'alice@example.com' })
      expect(transformContact(raw).email).toBe('alice@example.com')
    })

    it('maps mobile_number to phone', () => {
      const raw = makeRaw({ mobile_number: '+15555551234' })
      expect(transformContact(raw).phone).toBe('+15555551234')
    })

    it('maps lead_type to stage', () => {
      const raw = makeRaw({ lead_type: 'Hot' })
      expect(transformContact(raw).stage).toBe('Hot')
    })

    it('maps owner (string) to owner_id', () => {
      const raw = makeRaw({ owner: 'user-7' })
      expect(transformContact(raw).owner_id).toBe('user-7')
    })

    it('maps owner (number) to owner_id as string', () => {
      const raw = makeRaw({ owner: 5 })
      expect(transformContact(raw).owner_id).toBe('5')
    })

    it('sets owner_id to undefined when owner is absent', () => {
      const raw = makeRaw()
      expect(transformContact(raw).owner_id).toBeUndefined()
    })

    it('passes created_at ISO string through (normalized by toIsoDatetime)', () => {
      const raw = makeRaw({ created_at: '2024-01-15T10:00:00Z' })
      // toIsoDatetime re-serialises via new Date().toISOString(), which always
      // includes milliseconds — assert the normalised form.
      expect(transformContact(raw).created_at).toBe('2024-01-15T10:00:00.000Z')
    })

    it('passes updated_at ISO string through (normalized by toIsoDatetime)', () => {
      const raw = makeRaw({ updated_at: '2024-06-01T08:30:00Z' })
      expect(transformContact(raw).updated_at).toBe('2024-06-01T08:30:00.000Z')
    })
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRaw()
    expect(() => transformContact(raw)).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw({ id: 1, email: 'ref@example.com' })
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = makeRaw({ id: 42 })
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('untransformContact', () => {
  it('maps first_name → first_name', () => {
    expect(untransformContact({ first_name: 'Alice' })).toMatchObject({ first_name: 'Alice' })
  })

  it('maps last_name → last_name', () => {
    expect(untransformContact({ last_name: 'Jones' })).toMatchObject({ last_name: 'Jones' })
  })

  it('maps email → email', () => {
    expect(untransformContact({ email: 'alice@example.com' })).toMatchObject({
      email: 'alice@example.com',
    })
  })

  it('maps phone → mobile_number', () => {
    expect(untransformContact({ phone: '+15555551234' })).toMatchObject({
      mobile_number: '+15555551234',
    })
  })

  it('maps stage → lead_type', () => {
    expect(untransformContact({ stage: 'Hot' })).toMatchObject({ lead_type: 'Hot' })
  })

  it('maps owner_id → owner', () => {
    expect(untransformContact({ owner_id: 'user-7' })).toMatchObject({ owner: 'user-7' })
  })

  it('omits fields not provided in input', () => {
    const result = untransformContact({ first_name: 'Alice' })
    expect(result).not.toHaveProperty('last_name')
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('mobile_number')
    expect(result).not.toHaveProperty('lead_type')
    expect(result).not.toHaveProperty('owner')
  })

  it('maps all supported fields at once', () => {
    const result = untransformContact({
      first_name: 'Alice',
      last_name: 'Jones',
      email: 'alice@example.com',
      phone: '+15555551234',
      stage: 'Hot',
      owner_id: '5',
    })
    expect(result).toEqual({
      first_name: 'Alice',
      last_name: 'Jones',
      email: 'alice@example.com',
      mobile_number: '+15555551234',
      lead_type: 'Hot',
      owner: '5',
    })
  })
})
