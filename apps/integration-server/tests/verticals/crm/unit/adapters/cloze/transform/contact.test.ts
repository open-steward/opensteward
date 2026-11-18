import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawClozePerson,
} from '../../../../../../../src/verticals/crm/adapters/cloze/transform/contact'

function makeRaw(overrides: Partial<RawClozePerson> = {}): RawClozePerson {
  return { ...overrides }
}

describe('cloze transformContact', () => {
  it('maps id from direct field', () => {
    expect(transformContact(makeRaw({ direct: 'abc123' })).id).toBe('abc123')
  })

  it('falls back to id field when direct is absent', () => {
    expect(transformContact(makeRaw({ id: 'fallback-id' })).id).toBe('fallback-id')
  })

  it('returns empty string id when both direct and id are absent', () => {
    expect(transformContact(makeRaw()).id).toBe('')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first: 'Jane', last: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('uses raw.name when present', () => {
    const result = transformContact(makeRaw({ name: 'Full Name', first: 'Full', last: 'Name' }))
    expect(result.name).toBe('Full Name')
  })

  it('builds name from first + last when raw.name is absent', () => {
    const result = transformContact(makeRaw({ first: 'Alice', last: 'Smith' }))
    expect(result.name).toBe('Alice Smith')
  })

  it('picks work email over first entry', () => {
    const result = transformContact(
      makeRaw({
        emails: [
          { value: 'personal@example.com', work: false },
          { value: 'work@example.com', work: true },
        ],
      }),
    )
    expect(result.email).toBe('work@example.com')
  })

  it('falls back to first email when no work entry exists', () => {
    const result = transformContact(
      makeRaw({
        emails: [{ value: 'first@example.com' }, { value: 'second@example.com' }],
      }),
    )
    expect(result.email).toBe('first@example.com')
  })

  it('returns undefined email when emails array is absent', () => {
    expect(transformContact(makeRaw()).email).toBeUndefined()
  })

  it('picks the first phone entry', () => {
    const result = transformContact(
      makeRaw({
        phones: [{ value: '+1-555-0100' }, { value: '+1-555-0200' }],
      }),
    )
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps stage', () => {
    expect(transformContact(makeRaw({ stage: 'prospect' })).stage).toBe('prospect')
  })

  it('maps created_at from ISO string', () => {
    const result = transformContact(makeRaw({ created: '2024-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('maps updated_at from ISO string', () => {
    const result = transformContact(makeRaw({ modified: '2024-06-01T12:00:00.000Z' }))
    expect(result.updated_at).toBe('2024-06-01T12:00:00.000Z')
  })

  it('sets created_at and updated_at to undefined when timestamps are absent', () => {
    const result = transformContact(makeRaw())
    expect(result.created_at).toBeUndefined()
    expect(result.updated_at).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ direct: 'abc123' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('cloze untransformContact', () => {
  it('maps first_name to first and last_name to last', () => {
    const result = untransformContact({ first_name: 'Bob', last_name: 'Brown' })
    expect(result.first).toBe('Bob')
    expect(result.last).toBe('Brown')
  })

  it('wraps email as emails array with work: true', () => {
    const result = untransformContact({ email: 'user@example.com' })
    expect(result.emails).toEqual([{ value: 'user@example.com', work: true }])
  })

  it('wraps phone as phones array', () => {
    const result = untransformContact({ phone: '+1-555-0100' })
    expect(result.phones).toEqual([{ value: '+1-555-0100' }])
  })

  it('omits fields not present in input', () => {
    const result = untransformContact({})
    expect(result.first).toBeUndefined()
    expect(result.last).toBeUndefined()
    expect(result.emails).toBeUndefined()
    expect(result.phones).toBeUndefined()
    expect(result.stage).toBeUndefined()
  })
})
