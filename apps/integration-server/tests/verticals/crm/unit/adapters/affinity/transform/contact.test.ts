import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawAffinityContact } from '../../../../../../../src/verticals/crm/adapters/affinity/transform/contact'

function makeRaw(overrides: Partial<RawAffinityContact> = {}): RawAffinityContact {
  return { id: 1, ...overrides }
}

describe('affinity transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from primary_email_address', () => {
    expect(transformContact(makeRaw({ primary_email_address: 'j@a.com' })).email).toBe('j@a.com')
  })

  it('maps company_id from first organization_id', () => {
    expect(transformContact(makeRaw({ organization_ids: [5, 6] })).company_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact wraps email in array', () => {
    const result = untransformContact({ email: 'x@y.com' })
    expect((result.email_addresses as Array<{ address: string }>)[0].address).toBe('x@y.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
