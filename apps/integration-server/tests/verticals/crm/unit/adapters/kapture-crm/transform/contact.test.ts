import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawKaptureContact,
} from '../../../../../../../src/verticals/crm/adapters/kapture-crm/transform/contact'

function makeRaw(overrides: Partial<RawKaptureContact> = {}): RawKaptureContact {
  return { id: '1', ...overrides }
}

describe('kapture-crm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeRaw({ email: 'a@ex.com', phone: '123' }))
    expect(result.email).toBe('a@ex.com')
    expect(result.phone).toBe('123')
  })

  it('builds name from first_name and last_name when name absent', () => {
    const result = transformContact(makeRaw({ first_name: 'John', last_name: 'Doe' }))
    expect(result.name).toBe('John Doe')
  })

  it('uses name field directly if provided', () => {
    const result = transformContact(makeRaw({ name: 'Full Name' }))
    expect(result.name).toBe('Full Name')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: '42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('kapture-crm untransformContact', () => {
  it('maps email', () => {
    const result = untransformContact({ email: 'b@ex.com' })
    expect(result.email).toBe('b@ex.com')
  })
})
