import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawGallaboxContact,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/contact'

function makeRaw(overrides: Partial<RawGallaboxContact> = {}): RawGallaboxContact {
  return { id: 'c-1', ...overrides }
}

describe('gallabox transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('maps name directly when present', () => {
    expect(transformContact(makeRaw({ name: 'John Doe' })).name).toBe('John Doe')
  })

  it('splits two-part name into first and last', () => {
    const result = transformContact(makeRaw({ name: 'John Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('sets only first_name when name has one token', () => {
    const result = transformContact(makeRaw({ name: 'John' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBeUndefined()
  })

  it('joins remaining tokens into last_name for multi-word names', () => {
    const result = transformContact(makeRaw({ name: 'John Middle Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Middle Doe')
  })

  it('leaves first_name and last_name undefined when name is absent', () => {
    const result = transformContact(makeRaw())
    expect(result.first_name).toBeUndefined()
    expect(result.last_name).toBeUndefined()
  })

  it('takes the first element of the email array', () => {
    const result = transformContact(makeRaw({ email: ['a@example.com', 'b@example.com'] }))
    expect(result.email).toBe('a@example.com')
  })

  it('returns undefined email when the array is empty', () => {
    expect(transformContact(makeRaw({ email: [] })).email).toBeUndefined()
  })

  it('returns undefined email when the field is absent', () => {
    expect(transformContact(makeRaw()).email).toBeUndefined()
  })

  it('takes the first element of the phone array', () => {
    const result = transformContact(makeRaw({ phone: ['+15550001111', '+15550002222'] }))
    expect(result.phone).toBe('+15550001111')
  })

  it('returns undefined phone when the array is empty', () => {
    expect(transformContact(makeRaw({ phone: [] })).phone).toBeUndefined()
  })

  it('returns undefined phone when the field is absent', () => {
    expect(transformContact(makeRaw()).phone).toBeUndefined()
  })

  it('maps tags array to string array of names', () => {
    const result = transformContact(
      makeRaw({
        tags: [
          { id: 't1', name: 'VIP' },
          { id: 't2', name: 'Lead' },
        ],
      }),
    )
    expect(result.tags).toEqual(['VIP', 'Lead'])
  })

  it('filters empty tag names', () => {
    const result = transformContact(
      makeRaw({
        tags: [
          { id: 't1', name: '' },
          { id: 't2', name: 'Active' },
        ],
      }),
    )
    expect(result.tags).toEqual(['Active'])
  })

  it('returns undefined tags when all tag names are empty', () => {
    const result = transformContact(makeRaw({ tags: [{ id: 't1', name: '' }] }))
    expect(result.tags).toBeUndefined()
  })

  it('returns undefined tags when the field is absent', () => {
    expect(transformContact(makeRaw()).tags).toBeUndefined()
  })

  it('maps contactOwnerId to owner_id', () => {
    const result = transformContact(makeRaw({ contactOwnerId: 'owner-99' }))
    expect(result.owner_id).toBe('owner-99')
  })

  it('returns undefined owner_id when contactOwnerId is absent', () => {
    expect(transformContact(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps createdAt to created_at via toIsoDatetime', () => {
    const result = transformContact(makeRaw({ createdAt: '2024-01-15T10:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps updatedAt to updated_at via toIsoDatetime', () => {
    const result = transformContact(makeRaw({ updatedAt: '2024-06-01T08:30:00.000Z' }))
    expect(result.updated_at).toBe('2024-06-01T08:30:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('does not set title, company_id, mobile, stage, or address', () => {
    const result = transformContact(makeRaw())
    expect(result.title).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.mobile).toBeUndefined()
    expect(result.stage).toBeUndefined()
    expect(result.address).toBeUndefined()
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: '42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('gallabox untransformContact', () => {
  it('passes name through directly when present', () => {
    const result = untransformContact({ name: 'Jane Smith' })
    expect(result.name).toBe('Jane Smith')
  })

  it('builds name from first_name and last_name when name is absent', () => {
    const result = untransformContact({ first_name: 'Alice', last_name: 'Jones' })
    expect(result.name).toBe('Alice Jones')
  })

  it('wraps email in an array', () => {
    const result = untransformContact({ email: 'test@example.com' })
    expect(result.email).toEqual(['test@example.com'])
  })

  it('wraps phone in an array', () => {
    const result = untransformContact({ phone: '+15550001111' })
    expect(result.phone).toEqual(['+15550001111'])
  })

  it('omits name when neither name nor first/last is provided', () => {
    const result = untransformContact({ email: 'x@example.com' })
    expect(result).not.toHaveProperty('name')
  })
})
