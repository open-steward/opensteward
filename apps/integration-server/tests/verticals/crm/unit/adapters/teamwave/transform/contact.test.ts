import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawTeamwaveContact } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/contact'

function makeRaw(overrides: Partial<RawTeamwaveContact> = {}): RawTeamwaveContact {
  return { id: 1, ...overrides }
}

describe('teamwave transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('1')
  })

  it('maps organization_id to company_id', () => {
    expect(transformContact(makeRaw({ organization_id: 5 })).company_id).toBe('5')
  })

  it('maps tags array', () => {
    expect(transformContact(makeRaw({ tags: ['vip'] })).tags).toEqual(['vip'])
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

describe('teamwave untransformContact', () => {
  it('converts company_id to numeric organization_id', () => {
    expect(untransformContact({ company_id: '7' }).organization_id).toBe(7)
  })
})
