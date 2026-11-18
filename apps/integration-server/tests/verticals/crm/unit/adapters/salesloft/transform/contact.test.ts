import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawSalesloftContact } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/contact'

function makeRaw(overrides: Partial<RawSalesloftContact> = {}): RawSalesloftContact {
  return { id: 1, ...overrides }
}

describe('salesloft transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('1')
  })

  it('maps email_address to email', () => {
    expect(transformContact(makeRaw({ email_address: 'a@b.com' })).email).toBe('a@b.com')
  })

  it('maps account_id to company_id string', () => {
    expect(transformContact(makeRaw({ account_id: 42 })).company_id).toBe('42')
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

describe('salesloft untransformContact', () => {
  it('maps email to email_address', () => {
    expect(untransformContact({ email: 'a@b.com' }).email_address).toBe('a@b.com')
  })

  it('converts company_id to numeric account_id', () => {
    expect(untransformContact({ company_id: '5' }).account_id).toBe(5)
  })
})
