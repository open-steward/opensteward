import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCasAddress,
} from '../../../../../../../src/verticals/crm/adapters/cas-genesisworld/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawCasAddress> = {}): RawCasAddress {
  return { GWGUID: 'guid-1', ...overrides }
}

describe('cas-genesisworld transformContact', () => {
  it('maps GWGUID to string id', () => {
    expect(transformContact(makeRaw({ GWGUID: 'con-abc' })).id).toBe('con-abc')
  })

  it('maps FirstName to first_name', () => {
    expect(transformContact(makeRaw({ FirstName: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps LastName to last_name', () => {
    expect(transformContact(makeRaw({ LastName: 'Doe' })).last_name).toBe('Doe')
  })

  it('derives full name from FirstName + LastName', () => {
    const result = transformContact(makeRaw({ FirstName: 'Jane', LastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps EMail1 to email', () => {
    const result = transformContact(makeRaw({ EMail1: 'jane@acme.com' }))
    expect(result.email).toBe('jane@acme.com')
  })

  it('maps Phone1 to phone', () => {
    const result = transformContact(makeRaw({ Phone1: '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps Phone3 to mobile', () => {
    const result = transformContact(makeRaw({ Phone3: '+14155550199' }))
    expect(result.mobile).toBe('+14155550199')
  })

  it('maps JobTitle to title', () => {
    const result = transformContact(makeRaw({ JobTitle: 'VP Sales' }))
    expect(result.title).toBe('VP Sales')
  })

  it('maps CompanyGGUID to company_id', () => {
    const result = transformContact(makeRaw({ CompanyGGUID: 'co-7' }))
    expect(result.company_id).toBe('co-7')
  })

  it('maps UserGGUID to owner_id', () => {
    const result = transformContact(makeRaw({ UserGGUID: 'usr-3' }))
    expect(result.owner_id).toBe('usr-3')
  })

  it('maps CreateDate/UpdateDate to created_at/updated_at', () => {
    const result = transformContact(
      makeRaw({
        CreateDate: '2026-01-01T00:00:00.000Z',
        UpdateDate: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces output that passes ContactSchema.parse', () => {
    const raw = makeRaw({
      FirstName: 'Jane',
      LastName: 'Doe',
      EMail1: 'jane@acme.com',
      Phone1: '+14155550123',
      Phone3: '+14155550199',
      JobTitle: 'VP Sales',
      CompanyGGUID: 'co-7',
      UserGGUID: 'usr-3',
      CreateDate: '2026-01-01T00:00:00.000Z',
      UpdateDate: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('cas-genesisworld untransformContact', () => {
  it('always includes GWISCONTACT: true', () => {
    const result = untransformContact({})
    expect(result.GWISCONTACT).toBe(true)
  })

  it('maps first_name to FirstName', () => {
    const result = untransformContact({ first_name: 'Jane' })
    expect(result.FirstName).toBe('Jane')
  })

  it('maps last_name to LastName', () => {
    const result = untransformContact({ last_name: 'Doe' })
    expect(result.LastName).toBe('Doe')
  })

  it('maps email to EMail1', () => {
    const result = untransformContact({ email: 'jane@acme.com' })
    expect(result.EMail1).toBe('jane@acme.com')
  })

  it('maps mobile to Phone3', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    expect(result.Phone3).toBe('+14155550199')
  })

  it('maps company_id to CompanyGGUID', () => {
    const result = untransformContact({ company_id: 'co-7' })
    expect(result.CompanyGGUID).toBe('co-7')
  })
})
