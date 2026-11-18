import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawChurnZeroContact,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/contact'

function makeRaw(overrides: Partial<RawChurnZeroContact> = {}): RawChurnZeroContact {
  return { ...overrides }
}

describe('churnzero transformContact', () => {
  it('maps numeric Id to string', () => {
    expect(transformContact(makeRaw({ Id: 42 })).id).toBe('42')
  })

  it('maps string Id to string', () => {
    expect(transformContact(makeRaw({ Id: 'C001' })).id).toBe('C001')
  })

  it('falls back to ExternalId when Id is absent', () => {
    expect(transformContact(makeRaw({ ExternalId: 'EXT-1' })).id).toBe('EXT-1')
  })

  it('returns empty string when Id and ExternalId are both absent', () => {
    expect(transformContact(makeRaw()).id).toBe('')
  })

  it('maps FirstName', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps LastName', () => {
    expect(transformContact(makeRaw({ LastName: 'Doe' })).last_name).toBe('Doe')
  })

  it('maps Email', () => {
    expect(transformContact(makeRaw({ Email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('uses FullName as display name when present', () => {
    const result = transformContact(makeRaw({ FullName: 'Jane Doe', FirstName: 'Jane', LastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to Name field when FullName is absent', () => {
    expect(transformContact(makeRaw({ Name: 'Jane Doe' })).name).toBe('Jane Doe')
  })

  it('builds name from FirstName and LastName when FullName and Name are absent', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe' })).name).toBe('Jane Doe')
  })

  it('builds name from FirstName only', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane' })).name).toBe('Jane')
  })

  it('builds name from LastName only', () => {
    expect(transformContact(makeRaw({ LastName: 'Doe' })).name).toBe('Doe')
  })

  it('maps numeric AccountId to company_id string', () => {
    expect(transformContact(makeRaw({ AccountId: 99 })).company_id).toBe('99')
  })

  it('maps string AccountId to company_id', () => {
    expect(transformContact(makeRaw({ AccountId: 'ACC-1' })).company_id).toBe('ACC-1')
  })

  it('maps Tags when present and non-empty', () => {
    expect(transformContact(makeRaw({ Tags: ['vip', 'trial'] })).tags).toEqual(['vip', 'trial'])
  })

  it('omits tags when Tags is an empty array', () => {
    expect(transformContact(makeRaw({ Tags: [] })).tags).toBeUndefined()
  })

  it('maps ObjectCreatedDate to created_at', () => {
    expect(transformContact(makeRaw({ ObjectCreatedDate: '2024-01-01T00:00:00Z' })).created_at).toBe('2024-01-01T00:00:00Z')
  })

  it('maps ObjectLastModifiedDate to updated_at', () => {
    expect(transformContact(makeRaw({ ObjectLastModifiedDate: '2024-06-01T00:00:00Z' })).updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw({ Id: 'C1' })
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ Id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('churnzero untransformContact', () => {
  it('maps first_name to FirstName', () => {
    expect(untransformContact({ first_name: 'Jane' }).FirstName).toBe('Jane')
  })

  it('maps last_name to LastName', () => {
    expect(untransformContact({ last_name: 'Doe' }).LastName).toBe('Doe')
  })

  it('maps email to Email', () => {
    expect(untransformContact({ email: 'jane@example.com' }).Email).toBe('jane@example.com')
  })

  it('omits keys not present in the input', () => {
    const out = untransformContact({ first_name: 'Jane' })
    expect(out).not.toHaveProperty('LastName')
    expect(out).not.toHaveProperty('Email')
  })
})
