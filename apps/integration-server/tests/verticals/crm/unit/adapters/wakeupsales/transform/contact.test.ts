import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawWakeupsalesContact } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/contact'

function makeRaw(overrides: Partial<RawWakeupsalesContact> = {}): RawWakeupsalesContact {
  return { id: 'WU1', ...overrides }
}

describe('wakeupsales transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('WU1')
  })

  it('maps company_id to string', () => {
    expect(transformContact(makeRaw({ company_id: 10 })).company_id).toBe('10')
  })

  it('builds name from first and last', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', last_name: 'Wong' }))
    expect(result.name).toBe('Alice Wong')
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

describe('wakeupsales untransformContact', () => {
  it('maps email', () => {
    expect(untransformContact({ email: 'a@b.com' }).email).toBe('a@b.com')
  })

  it('maps company_id', () => {
    expect(untransformContact({ company_id: '5' }).company_id).toBe('5')
  })
})
