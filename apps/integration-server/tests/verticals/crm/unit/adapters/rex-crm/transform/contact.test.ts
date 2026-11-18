import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawRexContact,
} from '../../../../../../../src/verticals/crm/adapters/rex-crm/transform/contact'

function makeRaw(overrides: Partial<RawRexContact> = {}): RawRexContact {
  return { id: 1, ...overrides }
}

describe('rex-crm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps first/last name', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', last_name: 'Jones' }))
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBe('Jones')
  })

  it('maps email from email_addresses array', () => {
    const result = transformContact(makeRaw({ email_addresses: [{ email: 'alice@rex.com' }] }))
    expect(result.email).toBe('alice@rex.com')
  })

  it('maps phone from phone_numbers array', () => {
    const result = transformContact(makeRaw({ phone_numbers: [{ phone: '555-1234' }] }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps company_id from account_id', () => {
    expect(transformContact(makeRaw({ account_id: 7 })).company_id).toBe('7')
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

describe('rex-crm untransformContact', () => {
  it('maps email to email_addresses array', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect((result.email_addresses as Array<Record<string, unknown>>)[0]!['email']).toBe('a@b.com')
  })
})
