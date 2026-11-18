import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawSalesforceContact } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/contact'

function makeRaw(overrides: Partial<RawSalesforceContact> = {}): RawSalesforceContact {
  return { Id: 'SF001', ...overrides }
}

describe('salesforce transformContact', () => {
  it('maps Id to id', () => {
    expect(transformContact(makeRaw()).id).toBe('SF001')
  })

  it('builds name from first and last name', () => {
    const result = transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('maps AccountId to company_id', () => {
    expect(transformContact(makeRaw({ AccountId: 'ACC001' })).company_id).toBe('ACC001')
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

describe('salesforce untransformContact', () => {
  it('maps email and phone back to Salesforce fields', () => {
    const result = untransformContact({ first_name: 'Jane', last_name: 'Doe', email: 'j@example.com' })
    expect(result.FirstName).toBe('Jane')
    expect(result.Email).toBe('j@example.com')
  })

  it('maps company_id to AccountId', () => {
    const result = untransformContact({ company_id: 'ACC001' })
    expect(result.AccountId).toBe('ACC001')
  })
})
