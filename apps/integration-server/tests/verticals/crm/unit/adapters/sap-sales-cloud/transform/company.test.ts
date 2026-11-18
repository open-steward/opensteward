import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawSapAccount,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawSapAccount> = {}): RawSapAccount {
  return { id: 'acc-001', ...overrides }
}

describe('sap-sales-cloud transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'acc-42' })).id).toBe('acc-42')
  })

  it('maps name, falling back to empty string', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+14155550000' })).phone).toBe('+14155550000')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw({ industry: 'Technology' })).industry).toBe('Technology')
  })

  it('maps numeric numberOfEmployees to size', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: 250 })).size).toBe(250)
  })

  it('maps string numberOfEmployees to size integer', () => {
    expect(transformCompany(makeRaw({ numberOfEmployees: '500' })).size).toBe(500)
  })

  it('maps ownerId to owner_id', () => {
    expect(transformCompany(makeRaw({ ownerId: 'usr-7' })).owner_id).toBe('usr-7')
  })

  it('extracts hostname from webSite URL as domain, stripping www', () => {
    const result = transformCompany(makeRaw({ webSite: 'https://www.acme.example/home' }))
    expect(result.domain).toBe('acme.example')
  })

  it('uses raw webSite as domain when URL parsing fails', () => {
    const result = transformCompany(makeRaw({ webSite: 'not-a-url' }))
    expect(result.domain).toBe('not-a-url')
  })

  it('coerces createdAt through toIsoDatetime', () => {
    const result = transformCompany(makeRaw({ createdAt: '2024-05-10T08:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-10T08:00:00.000Z')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ name: 'Corp' })
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSapAccount = {
      id: 'acc-99',
      name: 'SAP Customer',
      phone: '+15550001234',
      industry: 'Finance',
      numberOfEmployees: 1200,
      ownerId: 'usr-1',
      webSite: 'https://www.sapcustomer.example',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastModifiedAt: '2024-06-01T00:00:00.000Z',
    }
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'NewCo' })).toMatchObject({ name: 'NewCo' })
  })

  it('maps size to numberOfEmployees', () => {
    expect(untransformCompany({ size: 100 })).toMatchObject({ numberOfEmployees: 100 })
  })

  it('maps domain to webSite', () => {
    expect(untransformCompany({ domain: 'example.com' })).toMatchObject({ webSite: 'example.com' })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformCompany({ owner_id: 'usr-3' })).toMatchObject({ ownerId: 'usr-3' })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformCompany({}))).toHaveLength(0)
  })
})
