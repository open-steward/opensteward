import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawCopperContact } from '../../../../../../../src/verticals/crm/adapters/copper/transform/contact'

function makeRaw(overrides: Partial<RawCopperContact> = {}): RawCopperContact {
  return { id: 1, ...overrides }
}

describe('copper transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('splits name into first_name and last_name', () => {
    const result = transformContact(makeRaw({ name: 'Jane Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from emails array', () => {
    const result = transformContact(makeRaw({ emails: [{ email: 'j@a.com' }] }))
    expect(result.email).toBe('j@a.com')
  })

  it('maps company_id from company_id', () => {
    expect(transformContact(makeRaw({ company_id: 5 })).company_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact wraps email in emails array', () => {
    const result = untransformContact({ email: 'j@a.com' })
    expect((result.emails as Array<{ email: string }>)[0].email).toBe('j@a.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
