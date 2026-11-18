import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/cas-genesisworld/transform/company'
import type { RawCasAddress } from '../../../../../../../src/verticals/crm/adapters/cas-genesisworld/transform/contact'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawCasAddress> = {}): RawCasAddress {
  return { GWGUID: 'guid-co-1', Company: 'Acme Corp', ...overrides }
}

describe('cas-genesisworld transformCompany', () => {
  it('maps GWGUID to string id', () => {
    expect(transformCompany(makeRaw({ GWGUID: 'co-abc' })).id).toBe('co-abc')
  })

  it('uses Company field as name', () => {
    expect(transformCompany(makeRaw({ Company: 'BigCo' })).name).toBe('BigCo')
  })

  it('falls back to concatenated FirstName+LastName when Company absent', () => {
    const result = transformCompany(
      makeRaw({ Company: undefined, FirstName: 'John', LastName: 'Smith' }),
    )
    expect(result.name).toBe('John Smith')
  })

  it('maps Phone1 to phone', () => {
    expect(transformCompany(makeRaw({ Phone1: '+14155550123' })).phone).toBe('+14155550123')
  })

  it('maps UserGGUID to owner_id', () => {
    expect(transformCompany(makeRaw({ UserGGUID: 'usr-9' })).owner_id).toBe('usr-9')
  })

  it('parses NumberOfEmployees custom field to size', () => {
    const raw = makeRaw({ NumberOfEmployees: '500' } as RawCasAddress)
    expect(transformCompany(raw).size).toBe(500)
  })

  it('parses Employees fallback custom field to size', () => {
    const raw = makeRaw({ Employees: '200' } as RawCasAddress)
    expect(transformCompany(raw).size).toBe(200)
  })

  it('maps CreateDate/UpdateDate to created_at/updated_at', () => {
    const result = transformCompany(
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
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces output that passes CompanySchema.parse', () => {
    const raw = makeRaw({
      Phone1: '+14155550123',
      UserGGUID: 'usr-1',
      NumberOfEmployees: '250',
      CreateDate: '2026-01-01T00:00:00.000Z',
      UpdateDate: '2026-02-01T00:00:00.000Z',
    } as RawCasAddress)
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('cas-genesisworld untransformCompany', () => {
  it('always includes GWISCOMPANY: true', () => {
    const result = untransformCompany({})
    expect(result.GWISCOMPANY).toBe(true)
  })

  it('maps name to Company', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.Company).toBe('Acme')
  })

  it('maps phone to Phone1', () => {
    const result = untransformCompany({ phone: '+14155550123' })
    expect(result.Phone1).toBe('+14155550123')
  })

  it('maps owner_id to UserGGUID', () => {
    const result = untransformCompany({ owner_id: 'usr-3' })
    expect(result.UserGGUID).toBe('usr-3')
  })

  it('maps size to NumberOfEmployees', () => {
    const result = untransformCompany({ size: 100 })
    expect(result.NumberOfEmployees).toBe(100)
  })
})
