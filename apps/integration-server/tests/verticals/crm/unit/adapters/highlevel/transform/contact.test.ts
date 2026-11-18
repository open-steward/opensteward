import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawHighLevelContact,
} from '../../../../../../../src/verticals/crm/adapters/highlevel/transform/contact'

function makeRaw(overrides: Partial<RawHighLevelContact> = {}): RawHighLevelContact {
  return { id: 'hl-1', ...overrides }
}

describe('highlevel transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw({ id: 'hl-1' })).id).toBe('hl-1')
  })

  it('builds name from firstName and lastName', () => {
    const result = transformContact(makeRaw({ firstName: 'John', lastName: 'Smith' }))
    expect(result.name).toBe('John Smith')
  })

  it('maps email and phone', () => {
    const result = transformContact(makeRaw({ email: 'j@example.com', phone: '+1234' }))
    expect(result.email).toBe('j@example.com')
    expect(result.phone).toBe('+1234')
  })

  it('maps assignedTo to owner_id', () => {
    expect(transformContact(makeRaw({ assignedTo: 'user-5' })).owner_id).toBe('user-5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'hl-1' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('highlevel untransformContact', () => {
  it('includes locationId', () => {
    const result = untransformContact({ first_name: 'A' }, 'loc-1')
    expect(result.locationId).toBe('loc-1')
  })
})
