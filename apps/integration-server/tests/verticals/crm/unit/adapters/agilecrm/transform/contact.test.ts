import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawAgileCrmContact } from '../../../../../../../src/verticals/crm/adapters/agilecrm/transform/contact'

function makeRaw(overrides: Partial<RawAgileCrmContact> = {}): RawAgileCrmContact {
  return { id: 1, properties: [], ...overrides }
}

describe('agilecrm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('extracts email from properties', () => {
    const raw = makeRaw({ properties: [{ name: 'email', value: 'j@a.com' }] })
    expect(transformContact(raw).email).toBe('j@a.com')
  })

  it('extracts first_name and last_name from properties', () => {
    const raw = makeRaw({
      properties: [
        { name: 'first_name', value: 'Jane' },
        { name: 'last_name', value: 'Doe' },
      ],
    })
    const result = transformContact(raw)
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact builds properties array', () => {
    const result = untransformContact({ first_name: 'A', email: 'a@b.com' })
    const props = result.properties as Array<{ name: string; value: string }>
    expect(props.some((p) => p.name === 'first_name' && p.value === 'A')).toBe(true)
    expect(props.some((p) => p.name === 'email' && p.value === 'a@b.com')).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
