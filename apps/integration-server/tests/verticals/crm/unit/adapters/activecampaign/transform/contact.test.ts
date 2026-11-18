import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawActiveCampaignContact } from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/contact'

function makeRaw(overrides: Partial<RawActiveCampaignContact> = {}): RawActiveCampaignContact {
  return { id: '1', ...overrides }
}

describe('activecampaign transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name fields', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.name).toBe('Jane Doe')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('maps company_id from orgid, skipping zero', () => {
    expect(transformContact(makeRaw({ orgid: '0' })).company_id).toBeUndefined()
    expect(transformContact(makeRaw({ orgid: '5' })).company_id).toBe('5')
  })

  it('untransformContact maps canonical fields back', () => {
    const result = untransformContact({ email: 'a@b.com', first_name: 'A', owner_id: '7' })
    expect(result.email).toBe('a@b.com')
    expect(result.firstName).toBe('A')
    expect(result.owner).toBe('7')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
