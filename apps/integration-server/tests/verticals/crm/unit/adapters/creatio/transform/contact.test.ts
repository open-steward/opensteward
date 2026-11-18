import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawCreatioContact } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/contact'

function makeRaw(overrides: Partial<RawCreatioContact> = {}): RawCreatioContact {
  return { Id: 'c1', ...overrides }
}

describe('creatio transformContact', () => {
  it('maps Id to id string', () => {
    expect(transformContact(makeRaw({ Id: 'abc' })).id).toBe('abc')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeRaw({ Email: 'j@a.com', Phone: '123' }))
    expect(result.email).toBe('j@a.com')
    expect(result.phone).toBe('123')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps FirstName/LastName', () => {
    const result = untransformContact({ first_name: 'A', last_name: 'B' })
    expect(result.FirstName).toBe('A')
    expect(result.LastName).toBe('B')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ Id: 'abc' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
