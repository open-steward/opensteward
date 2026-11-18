import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawSansanContact } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/contact'

function makeRaw(overrides: Partial<RawSansanContact> = {}): RawSansanContact {
  return { id: 'SAN001', ...overrides }
}

describe('sansan transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('SAN001')
  })

  it('maps tel to phone', () => {
    expect(transformContact(makeRaw({ tel: '555-1234' })).phone).toBe('555-1234')
  })

  it('maps companyId to company_id', () => {
    expect(transformContact(makeRaw({ companyId: 'CO1' })).company_id).toBe('CO1')
  })

  it('builds name from first and last', () => {
    const result = transformContact(makeRaw({ firstName: 'Taro', lastName: 'Yamada' }))
    expect(result.name).toBe('Taro Yamada')
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

describe('sansan untransformContact', () => {
  it('maps phone to tel', () => {
    expect(untransformContact({ phone: '123' }).tel).toBe('123')
  })
})
