import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawCloseContact } from '../../../../../../../src/verticals/crm/adapters/close/transform/contact'

function makeRaw(overrides: Partial<RawCloseContact> = {}): RawCloseContact {
  return { id: 'c1', ...overrides }
}

describe('close transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw()).id).toBe('c1')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from emails array', () => {
    const result = transformContact(makeRaw({ emails: [{ email: 'j@a.com' }] }))
    expect(result.email).toBe('j@a.com')
  })

  it('maps company_id from lead_id', () => {
    expect(transformContact(makeRaw({ lead_id: 'lead1' })).company_id).toBe('lead1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact maps email to emails array', () => {
    const result = untransformContact({ email: 'j@a.com' })
    expect((result.emails as Array<{ email: string }>)[0].email).toBe('j@a.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
