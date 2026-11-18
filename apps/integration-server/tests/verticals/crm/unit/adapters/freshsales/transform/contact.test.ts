import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawFreshsalesContact,
} from '../../../../../../../src/verticals/crm/adapters/freshsales/transform/contact'

function makeRaw(overrides: Partial<RawFreshsalesContact> = {}): RawFreshsalesContact {
  return { id: 1, ...overrides }
}

describe('freshsales transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps primary email from emails array', () => {
    const result = transformContact(makeRaw({
      emails: [{ value: 'a@example.com', is_primary: false }, { value: 'b@example.com', is_primary: true }],
    }))
    expect(result.email).toBe('b@example.com')
  })

  it('falls back to first email when none is primary', () => {
    const result = transformContact(makeRaw({ emails: [{ value: 'first@example.com' }] }))
    expect(result.email).toBe('first@example.com')
  })

  it('builds name from first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('freshsales untransformContact', () => {
  it('maps email to emails array', () => {
    const result = untransformContact({ email: 'x@example.com' })
    expect((result.emails as Array<{ value: string }>)[0].value).toBe('x@example.com')
  })

  it('maps company_id to sales_account_id as number', () => {
    const result = untransformContact({ company_id: '5' })
    expect(result.sales_account_id).toBe(5)
  })
})
