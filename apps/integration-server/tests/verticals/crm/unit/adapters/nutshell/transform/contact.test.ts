import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawNutshellContact,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/contact'

function makeRaw(overrides: Partial<RawNutshellContact> = {}): RawNutshellContact {
  return { id: 1, ...overrides }
}

describe('nutshell transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('splits name into first/last', () => {
    const result = transformContact(makeRaw({ name: 'John Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('extracts email from object-style emails', () => {
    const result = transformContact(makeRaw({ emails: { work: ['test@example.com'] } }))
    expect(result.email).toBe('test@example.com')
  })

  it('extracts email from array-style emails', () => {
    const result = transformContact(makeRaw({ emails: ['arr@example.com'] }))
    expect(result.email).toBe('arr@example.com')
  })

  it('maps company_id from first account', () => {
    const result = transformContact(makeRaw({ accounts: [{ id: 99 }] }))
    expect(result.company_id).toBe('99')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('nutshell untransformContact', () => {
  it('returns an object with expected shape', () => {
    const result = untransformContact({ name: 'Jane Smith', email: 'j@example.com' })
    expect(result.name).toBe('Jane Smith')
    expect(result).toHaveProperty('emails')
  })

  it('builds name from first_name + last_name when name absent', () => {
    const result = untransformContact({ first_name: 'Alice', last_name: 'Jones' })
    expect(result.name).toBe('Alice Jones')
  })
})
