import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawApolloContact } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/contact'

function makeRaw(overrides: Partial<RawApolloContact> = {}): RawApolloContact {
  return { id: 'c1', ...overrides }
}

describe('apollo transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('c1')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe', name: 'Jane Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps phone from first phone_number', () => {
    const result = transformContact(makeRaw({ phone_numbers: [{ sanitized_number: '+15555555555' }] }))
    expect(result.phone).toBe('+15555555555')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps fields back', () => {
    const result = untransformContact({ email: 'j@a.com', title: 'VP' })
    expect(result.email).toBe('j@a.com')
    expect(result.title).toBe('VP')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
