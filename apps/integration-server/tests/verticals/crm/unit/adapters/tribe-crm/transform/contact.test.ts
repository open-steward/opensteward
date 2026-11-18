import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawTribeCrmRelation,
} from '../../../../../../../src/verticals/crm/adapters/tribe-crm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawTribeCrmRelation> = {}): RawTribeCrmRelation {
  return { Id: 1, ...overrides }
}

describe('tribe-crm transformContact', () => {
  it('maps Id to string id', () => {
    expect(transformContact(makeRaw({ Id: 42 })).id).toBe('42')
  })

  it('maps FirstName and LastName', () => {
    const result = transformContact(makeRaw({ FirstName: 'Ada', LastName: 'Lovelace' }))
    expect(result.first_name).toBe('Ada')
    expect(result.last_name).toBe('Lovelace')
  })

  it('derives name from FirstName and LastName', () => {
    const result = transformContact(makeRaw({ FirstName: 'Ada', LastName: 'Lovelace' }))
    expect(result.name).toBe('Ada Lovelace')
  })

  it('maps EmailAddress to email', () => {
    const result = transformContact(makeRaw({ EmailAddress: 'ada@example.com' }))
    expect(result.email).toBe('ada@example.com')
  })

  it('maps PhoneNumber to phone', () => {
    const result = transformContact(makeRaw({ PhoneNumber: '+14155550100' }))
    expect(result.phone).toBe('+14155550100')
  })

  it('maps MobileNumber to mobile', () => {
    const result = transformContact(makeRaw({ MobileNumber: '+14155550199' }))
    expect(result.mobile).toBe('+14155550199')
  })

  it('maps JobTitle to title', () => {
    const result = transformContact(makeRaw({ JobTitle: 'CTO' }))
    expect(result.title).toBe('CTO')
  })

  it('maps OrganisationId to company_id', () => {
    const result = transformContact(makeRaw({ OrganisationId: 99 }))
    expect(result.company_id).toBe('99')
  })

  it('maps OwnerId to owner_id', () => {
    const result = transformContact(makeRaw({ OwnerId: 5 }))
    expect(result.owner_id).toBe('5')
  })

  it('maps CreatedOn to created_at', () => {
    const result = transformContact(makeRaw({ CreatedOn: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const raw = makeRaw({
      Id: 42,
      FirstName: 'Ada',
      LastName: 'Lovelace',
      EmailAddress: 'ada@example.com',
      PhoneNumber: '+14155550100',
      MobileNumber: '+14155550199',
      JobTitle: 'CTO',
      OrganisationId: 99,
      OwnerId: 5,
      CreatedOn: '2026-01-15T09:30:00.000Z',
      ModifiedOn: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('tribe-crm untransformContact', () => {
  it('maps first_name back to FirstName', () => {
    const result = untransformContact({ first_name: 'Ada' })
    expect(result.FirstName).toBe('Ada')
  })

  it('maps email back to EmailAddress', () => {
    const result = untransformContact({ email: 'ada@example.com' })
    expect(result.EmailAddress).toBe('ada@example.com')
  })

  it('maps mobile back to MobileNumber', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    expect(result.MobileNumber).toBe('+14155550199')
  })

  it('maps company_id back to OrganisationId', () => {
    const result = untransformContact({ company_id: '99' })
    expect(result.OrganisationId).toBe('99')
  })

  it('maps owner_id back to OwnerId', () => {
    const result = untransformContact({ owner_id: '5' })
    expect(result.OwnerId).toBe('5')
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
