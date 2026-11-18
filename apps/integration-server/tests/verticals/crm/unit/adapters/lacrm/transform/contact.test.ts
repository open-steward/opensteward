import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawLacrmContact,
} from '../../../../../../../src/verticals/crm/adapters/lacrm/transform/contact'

function makeRaw(overrides: Partial<RawLacrmContact> = {}): RawLacrmContact {
  return { ContactId: 'c-1', ...overrides }
}

describe('lacrm transformContact', () => {
  it('maps ContactId to id', () => {
    expect(transformContact(makeRaw({ ContactId: 'c-1' })).id).toBe('c-1')
  })

  it('maps Name to name', () => {
    expect(transformContact(makeRaw({ Name: 'Full Name' })).name).toBe('Full Name')
  })

  it('splits Name into first_name and last_name', () => {
    const result = transformContact(makeRaw({ Name: 'John Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('maps email from Email array', () => {
    const result = transformContact(makeRaw({ Email: [{ Text: 'j@example.com' }] }))
    expect(result.email).toBe('j@example.com')
  })

  it('maps AssignedTo to owner_id', () => {
    expect(transformContact(makeRaw({ AssignedTo: 'user-1' })).owner_id).toBe('user-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ ContactId: 'c-1' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('lacrm untransformContact', () => {
  it('maps email to Email array', () => {
    const result = untransformContact({ email: 'x@example.com' })
    expect((result.Email as Array<{ Text: string }>)[0].Text).toBe('x@example.com')
  })
})
