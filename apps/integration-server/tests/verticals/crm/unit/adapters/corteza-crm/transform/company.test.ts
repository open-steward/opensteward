import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawCortezaAccount,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawCortezaAccount> = {}): RawCortezaAccount {
  return {
    recordID: 'rec-1',
    moduleID: 'mod-1',
    namespaceID: 'ns-1',
    values: [],
    ...overrides,
  }
}

// Fixture shape: the record in docs.cortezaproject.org "Working With Low Code
// Records" ({ recordID, moduleID, values: [{ name, value }], namespaceID }),
// plus createdAt/updatedAt from server/compose/types/record.go. Field names
// are the module's in corteza-server provision/700_crm/1100_modules.yaml.
describe('corteza-crm transformCompany', () => {
  const doc = makeRaw({
    recordID: '312345678901234001',
    moduleID: '212345678901234002',
    namespaceID: '112345678901234567',
    values: [
      { name: 'AccountName', value: 'Acme Corp' },
      { name: 'Phone', value: '+14155550100' },
      { name: 'Industry', value: 'Technology' },
      { name: 'NumberOfEmployees', value: '350' },
      { name: 'OwnerId', value: '412345678901234567' },
      { name: 'BillingStreet', value: '200 Corp Ave' },
      { name: 'BillingCity', value: 'Metropolis' },
      { name: 'BillingState', value: 'NY' },
      { name: 'BillingPostalCode', value: '10001' },
      { name: 'BillingCountry', value: 'United States' },
    ],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-03T09:00:00Z',
  })

  it('maps the documented record to a CompanySchema-valid company', () => {
    expect(CompanySchema.parse(transformCompany(doc))).toMatchObject({
      id: '312345678901234001',
      name: 'Acme Corp',
      phone: '+14155550100',
      industry: 'Technology',
      size: 350,
      owner_id: '412345678901234567',
      address: { line1: '200 Corp Ave', city: 'Metropolis', region: 'NY', postalCode: '10001' },
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-03T09:00:00.000Z',
    })
  })

  it('leaves the country name out of the ISO address', () => {
    expect(transformCompany(doc).address?.country).toBeUndefined()
  })

  it('an omitted AccountName value is the empty name', () => {
    expect(CompanySchema.parse(transformCompany(makeRaw({ values: [] }))).name).toBe('')
  })

  it('drops a NumberOfEmployees that is not a whole number', () => {
    const raw = makeRaw({
      values: [
        { name: 'AccountName', value: 'A' },
        { name: 'NumberOfEmployees', value: '12.5' },
      ],
    })
    expect(CompanySchema.parse(transformCompany(raw)).size).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    expect(transformCompany(doc).metadata).toBe(doc)
  })
})

describe('corteza-crm untransformCompany', () => {
  it('maps name → AccountName field', () => {
    const values = untransformCompany({ name: 'Acme Corp' })
    expect(values.find((v) => v.name === 'AccountName')?.value).toBe('Acme Corp')
  })

  it('maps size → NumberOfEmployees as string', () => {
    const values = untransformCompany({ size: 350 })
    expect(values.find((v) => v.name === 'NumberOfEmployees')?.value).toBe('350')
  })

  it('maps address fields', () => {
    const values = untransformCompany({
      address: {
        line1: '200 Corp Ave',
        city: 'Metropolis',
        region: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    })
    expect(values.find((v) => v.name === 'BillingStreet')?.value).toBe('200 Corp Ave')
    expect(values.find((v) => v.name === 'BillingCity')?.value).toBe('Metropolis')
  })

  it('round-trips name and industry', () => {
    const raw = makeRaw({
      values: [
        { name: 'AccountName', value: 'Acme Corp' },
        { name: 'Industry', value: 'Technology' },
      ],
    })
    const company = transformCompany(raw)
    const back = untransformCompany(company)
    expect(back.find((v) => v.name === 'AccountName')?.value).toBe('Acme Corp')
    expect(back.find((v) => v.name === 'Industry')?.value).toBe('Technology')
  })
})
