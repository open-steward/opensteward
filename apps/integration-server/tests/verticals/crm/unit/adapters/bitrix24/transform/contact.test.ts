import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawBitrix24Contact } from '../../../../../../../src/verticals/crm/adapters/bitrix24/transform/contact'

function makeRaw(overrides: Partial<RawBitrix24Contact> = {}): RawBitrix24Contact {
  return { ID: '1', ...overrides }
}

describe('bitrix24 transformContact', () => {
  it('maps ID to id string', () => {
    expect(transformContact(makeRaw({ ID: '42' })).id).toBe('42')
  })

  it('maps name fields from NAME and LAST_NAME', () => {
    const result = transformContact(makeRaw({ NAME: 'Jane', LAST_NAME: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from EMAIL array', () => {
    const result = transformContact(makeRaw({ EMAIL: [{ VALUE: 'j@a.com' }] }))
    expect(result.email).toBe('j@a.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps NAME fields back', () => {
    const result = untransformContact({ first_name: 'A', last_name: 'B' })
    expect(result.NAME).toBe('A')
    expect(result.LAST_NAME).toBe('B')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ ID: '42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
