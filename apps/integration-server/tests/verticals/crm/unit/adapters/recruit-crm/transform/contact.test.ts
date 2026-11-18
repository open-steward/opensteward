import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawRecruitCrmContact,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/contact'

function makeRaw(overrides: Partial<RawRecruitCrmContact> = {}): RawRecruitCrmContact {
  return { id: '1', ...overrides }
}

describe('recruit-crm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('falls back to slug when id absent', () => {
    expect(transformContact({ slug: 'contact-slug' }).id).toBe('contact-slug')
  })

  it('maps first and last name', () => {
    const result = transformContact(makeRaw({ first_name: 'Alice', last_name: 'Jones' }))
    expect(result.first_name).toBe('Alice')
    expect(result.last_name).toBe('Jones')
  })

  it('maps owner_id from owner object', () => {
    const result = transformContact(makeRaw({ owner: { id: '99' } }))
    expect(result.owner_id).toBe('99')
  })

  it('maps owner_id from scalar owner', () => {
    const result = transformContact(makeRaw({ owner: '55' }))
    expect(result.owner_id).toBe('55')
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

describe('recruit-crm untransformContact', () => {
  it('maps email', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect(result.email).toBe('a@b.com')
  })
})
