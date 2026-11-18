import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawDynamicsContact } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/contact'

function makeRaw(overrides: Partial<RawDynamicsContact> = {}): RawDynamicsContact {
  return { contactid: 'c1', ...overrides }
}

describe('dynamics365-crm transformContact', () => {
  it('maps contactid to id', () => {
    expect(transformContact(makeRaw({ contactid: 'abc' })).id).toBe('abc')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ firstname: 'Jane', lastname: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from emailaddress1', () => {
    expect(transformContact(makeRaw({ emailaddress1: 'j@a.com' })).email).toBe('j@a.com')
  })

  it('maps company_id from _parentcustomerid_value', () => {
    expect(transformContact(makeRaw({ _parentcustomerid_value: 'a1' })).company_id).toBe('a1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps firstname/lastname', () => {
    const result = untransformContact({ first_name: 'A', last_name: 'B' })
    expect(result.firstname).toBe('A')
    expect(result.lastname).toBe('B')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ contactid: 'abc' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
