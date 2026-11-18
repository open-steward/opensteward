import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawZendeskSellContact } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/contact'

function makeRaw(overrides: Partial<RawZendeskSellContact> = {}): RawZendeskSellContact {
  return { id: 1, is_organization: false, ...overrides }
}

describe('zendesk-sell transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('1')
  })

  it('maps mobile to phone', () => {
    expect(transformContact(makeRaw({ mobile: '555-0001' })).phone).toBe('555-0001')
  })

  it('maps organization_id to company_id', () => {
    expect(transformContact(makeRaw({ organization_id: 9 })).company_id).toBe('9')
  })

  it('builds name from first and last', () => {
    const result = transformContact(makeRaw({ first_name: 'Bob', last_name: 'Builder' }))
    expect(result.name).toBe('Bob Builder')
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

describe('zendesk-sell untransformContact', () => {
  it('always sets is_organization to false', () => {
    expect(untransformContact({}).is_organization).toBe(false)
  })

  it('maps phone to mobile', () => {
    expect(untransformContact({ phone: '555' }).mobile).toBe('555')
  })
})
