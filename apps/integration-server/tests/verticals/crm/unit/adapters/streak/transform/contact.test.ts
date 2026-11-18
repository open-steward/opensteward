import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawStreakContact } from '../../../../../../../src/verticals/crm/adapters/streak/transform/contact'

function makeRaw(overrides: Partial<RawStreakContact> = {}): RawStreakContact {
  return { key: 'streakKey1', ...overrides }
}

describe('streak transformContact', () => {
  it('maps key to id', () => {
    expect(transformContact(makeRaw()).id).toBe('streakKey1')
  })

  it('picks first email address', () => {
    expect(transformContact(makeRaw({ emailAddresses: ['a@b.com', 'c@d.com'] })).email).toBe('a@b.com')
  })

  it('converts createdDate timestamp to ISO string', () => {
    const ts = 1700000000000
    const result = transformContact(makeRaw({ createdDate: ts }))
    expect(result.created_at).toBe(new Date(ts).toISOString())
  })

  it('company_id is always undefined (embedded in contact)', () => {
    expect(transformContact(makeRaw()).company_id).toBeUndefined()
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

describe('streak untransformContact', () => {
  it('wraps email in emailAddresses array', () => {
    expect(untransformContact({ email: 'a@b.com' }).emailAddresses).toEqual(['a@b.com'])
  })

  it('maps first_name to givenName', () => {
    expect(untransformContact({ first_name: 'Jane' }).givenName).toBe('Jane')
  })
})
