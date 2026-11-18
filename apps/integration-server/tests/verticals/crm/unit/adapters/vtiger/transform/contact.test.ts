import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawVtigerContact } from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/contact'

function makeRaw(overrides: Partial<RawVtigerContact> = {}): RawVtigerContact {
  return { id: 'VT001', ...overrides }
}

describe('vtiger transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('VT001')
  })

  it('maps accountid to company_id', () => {
    expect(transformContact(makeRaw({ accountid: 'ACC1' })).company_id).toBe('ACC1')
  })

  it('builds name from firstname and lastname', () => {
    const result = transformContact(makeRaw({ firstname: 'John', lastname: 'Smith' }))
    expect(result.name).toBe('John Smith')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('vtiger untransformContact', () => {
  it('maps first_name to firstname', () => {
    expect(untransformContact({ first_name: 'John' }).firstname).toBe('John')
  })

  it('maps company_id to accountid', () => {
    expect(untransformContact({ company_id: 'A1' }).accountid).toBe('A1')
  })
})
