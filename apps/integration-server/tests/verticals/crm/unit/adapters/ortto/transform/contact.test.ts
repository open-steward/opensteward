import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawOrttoContact,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/contact'

function makeRaw(overrides: Partial<RawOrttoContact> = {}): RawOrttoContact {
  return { id: 'ortto-1', ...overrides }
}

describe('ortto transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'abc' })).id).toBe('abc')
  })

  it('maps first/last name from fields', () => {
    const result = transformContact(makeRaw({
      fields: { 'str::first': { v: 'Jane' }, 'str::last': { v: 'Doe' } },
    }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds name from first + last', () => {
    const result = transformContact(makeRaw({
      fields: { 'str::first': { v: 'Jane' }, 'str::last': { v: 'Doe' } },
    }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from fields', () => {
    const result = transformContact(makeRaw({
      fields: { 'str::email': { v: 'jane@ortto.com' } },
    }))
    expect(result.email).toBe('jane@ortto.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'abc' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('ortto untransformContact', () => {
  it('wraps fields in Ortto format', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect((result.fields as Record<string, unknown>)['str::email']).toEqual({ v: 'a@b.com' })
  })
})
