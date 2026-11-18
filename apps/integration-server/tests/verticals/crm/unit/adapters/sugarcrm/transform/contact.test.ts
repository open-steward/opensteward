import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawSugarContact } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/contact'

function makeRaw(overrides: Partial<RawSugarContact> = {}): RawSugarContact {
  return { id: 'SCON1', ...overrides }
}

describe('sugarcrm transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('SCON1')
  })

  it('maps email1 to email', () => {
    expect(transformContact(makeRaw({ email1: 'a@b.com' })).email).toBe('a@b.com')
  })

  it('maps phone_work to phone', () => {
    expect(transformContact(makeRaw({ phone_work: '555-0000' })).phone).toBe('555-0000')
  })

  it('appends Z to non-zoned date strings', () => {
    const result = transformContact(makeRaw({ date_entered: '2024-01-01 10:00:00' }))
    expect(result.created_at).toBe('2024-01-01 10:00:00Z')
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

describe('sugarcrm untransformContact', () => {
  it('maps email to email1', () => {
    expect(untransformContact({ email: 'a@b.com' }).email1).toBe('a@b.com')
  })

  it('maps phone to phone_work', () => {
    expect(untransformContact({ phone: '555' }).phone_work).toBe('555')
  })
})
