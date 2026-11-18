import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawCapsuleContact } from '../../../../../../../src/verticals/crm/adapters/capsule/transform/contact'

function makeRaw(overrides: Partial<RawCapsuleContact> = {}): RawCapsuleContact {
  return { id: 1, ...overrides }
}

describe('capsule transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from emailAddresses', () => {
    const result = transformContact(makeRaw({ emailAddresses: [{ address: 'j@a.com' }] }))
    expect(result.email).toBe('j@a.com')
  })

  it('prefers Work phone type', () => {
    const result = transformContact(makeRaw({
      phoneNumbers: [{ number: '111', type: 'Home' }, { number: '222', type: 'Work' }],
    }))
    expect(result.phone).toBe('222')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact wraps email in emailAddresses', () => {
    const result = untransformContact({ email: 'j@a.com' })
    expect((result.emailAddresses as Array<{ address: string }>)[0].address).toBe('j@a.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
