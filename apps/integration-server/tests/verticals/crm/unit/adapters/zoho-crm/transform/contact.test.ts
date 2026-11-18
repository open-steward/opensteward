import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawZohoContact } from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/contact'

function makeRaw(overrides: Partial<RawZohoContact> = {}): RawZohoContact {
  return { id: 'ZOHO001', ...overrides }
}

describe('zoho-crm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('ZOHO001')
  })

  it('maps First_Name and Last_Name', () => {
    const result = transformContact(makeRaw({ First_Name: 'Zoho', Last_Name: 'User' }))
    expect(result.first_name).toBe('Zoho')
    expect(result.last_name).toBe('User')
    expect(result.name).toBe('Zoho User')
  })

  it('maps Account_Name.id to company_id', () => {
    expect(transformContact(makeRaw({ Account_Name: { id: 'ACC1' } })).company_id).toBe('ACC1')
  })

  it('maps Owner.id to owner_id', () => {
    expect(transformContact(makeRaw({ Owner: { id: 'OWN1' } })).owner_id).toBe('OWN1')
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

describe('zoho-crm untransformContact', () => {
  it('maps first_name to First_Name', () => {
    expect(untransformContact({ first_name: 'Zoho' }).First_Name).toBe('Zoho')
  })

  it('maps email to Email', () => {
    expect(untransformContact({ email: 'z@zoho.com' }).Email).toBe('z@zoho.com')
  })
})
