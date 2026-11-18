import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawGrooveCustomer,
} from '../../../../../../../src/verticals/crm/adapters/groove-sales/transform/contact'

function makeRaw(overrides: Partial<RawGrooveCustomer> = {}): RawGrooveCustomer {
  return { id: 1, ...overrides }
}

describe('groove-sales transformContact', () => {
  it('maps numeric id to string', () => {
    expect(transformContact(makeRaw({ id: 123 })).id).toBe('123')
  })

  it('maps string id to string', () => {
    expect(transformContact(makeRaw({ id: '123' })).id).toBe('123')
  })

  it('maps first_name directly when present', () => {
    expect(transformContact(makeRaw({ first_name: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps last_name directly when present', () => {
    expect(transformContact(makeRaw({ last_name: 'Smith' })).last_name).toBe('Smith')
  })

  it('returns undefined for first_name when absent', () => {
    expect(transformContact(makeRaw()).first_name).toBeUndefined()
  })

  it('returns undefined for last_name when absent', () => {
    expect(transformContact(makeRaw()).last_name).toBeUndefined()
  })

  it('returns undefined for first_name when null', () => {
    expect(transformContact(makeRaw({ first_name: null })).first_name).toBeUndefined()
  })

  it('splits full name into first and last when both explicit fields absent', () => {
    const result = transformContact(makeRaw({ name: 'John Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('sets first_name and leaves last_name undefined when name has single word', () => {
    const result = transformContact(makeRaw({ name: 'John' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBeUndefined()
  })

  it('does not apply name-split fallback when first_name is present', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', name: 'Ignored Name' }))
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBeUndefined()
  })

  it('passes raw.name through to name field when present', () => {
    expect(transformContact(makeRaw({ name: 'Full Name' })).name).toBe('Full Name')
  })

  it('builds name from first and last when raw.name is absent', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', last_name: 'Jones' }))
    expect(result.name).toBe('Alice Jones')
  })

  it('returns undefined for name when no name fields present', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps email when present', () => {
    expect(transformContact(makeRaw({ email: 'test@example.com' })).email).toBe('test@example.com')
  })

  it('returns undefined for email when null', () => {
    expect(transformContact(makeRaw({ email: null })).email).toBeUndefined()
  })

  it('returns undefined for email when absent', () => {
    expect(transformContact(makeRaw()).email).toBeUndefined()
  })

  it('maps phone when present', () => {
    expect(transformContact(makeRaw({ phone: '555-1234' })).phone).toBe('555-1234')
  })

  it('returns undefined for phone when null', () => {
    expect(transformContact(makeRaw({ phone: null })).phone).toBeUndefined()
  })

  it('maps title when present', () => {
    expect(transformContact(makeRaw({ title: 'VP Sales' })).title).toBe('VP Sales')
  })

  it('returns undefined for title when null', () => {
    expect(transformContact(makeRaw({ title: null })).title).toBeUndefined()
  })

  it('maps numeric owner_id to string', () => {
    expect(transformContact(makeRaw({ owner_id: 77 })).owner_id).toBe('77')
  })

  it('maps string owner_id to string', () => {
    expect(transformContact(makeRaw({ owner_id: '77' })).owner_id).toBe('77')
  })

  it('returns undefined for owner_id when null', () => {
    expect(transformContact(makeRaw({ owner_id: null })).owner_id).toBeUndefined()
  })

  it('always returns undefined for company_id', () => {
    expect(transformContact(makeRaw({ company_name: 'Acme Corp' })).company_id).toBeUndefined()
  })

  it('returns undefined for mobile', () => {
    expect(transformContact(makeRaw()).mobile).toBeUndefined()
  })

  it('returns undefined for tags', () => {
    expect(transformContact(makeRaw()).tags).toBeUndefined()
  })

  it('returns undefined for stage', () => {
    expect(transformContact(makeRaw()).stage).toBeUndefined()
  })

  it('returns undefined for address', () => {
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
    const result = transformContact(makeRaw({ id: 123 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('groove-sales untransformContact', () => {
  it('maps email to email', () => {
    expect(untransformContact({ email: 'a@b.com' })).toMatchObject({ email: 'a@b.com' })
  })

  it('maps first_name to first_name', () => {
    expect(untransformContact({ first_name: 'Bob' })).toMatchObject({ first_name: 'Bob' })
  })

  it('maps last_name to last_name', () => {
    expect(untransformContact({ last_name: 'Brown' })).toMatchObject({ last_name: 'Brown' })
  })

  it('maps name to name when present', () => {
    expect(untransformContact({ name: 'Bob Brown' })).toMatchObject({ name: 'Bob Brown' })
  })

  it('builds name from first and last when name absent', () => {
    const result = untransformContact({ first_name: 'Alice', last_name: 'Jones' })
    expect(result['name']).toBe('Alice Jones')
  })

  it('maps phone to phone', () => {
    expect(untransformContact({ phone: '555-9999' })).toMatchObject({ phone: '555-9999' })
  })

  it('maps title to title', () => {
    expect(untransformContact({ title: 'Director' })).toMatchObject({ title: 'Director' })
  })
})
