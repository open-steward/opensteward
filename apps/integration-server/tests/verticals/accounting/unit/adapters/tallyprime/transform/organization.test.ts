import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type TallyOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/organization'

function makeOrganization(overrides: Partial<TallyOrganization> = {}): TallyOrganization {
  return {
    COMPANYNAME: 'Tata Industries Ltd',
    ADDRESS: '1 Corporate Park, Powai',
    PINCODE: '400076',
    STATENAME: 'Maharashtra',
    COUNTRYNAME: 'India',
    EMAIL: 'finance@tata.com',
    PHONE: '+91-22-66658888',
    GSTIN: '27AABCT1332L1ZV',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps COMPANYNAME to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('Tata Industries Ltd')
  })

  it('maps COMPANYNAME to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Tata Industries Ltd')
  })

  it('maps COMPANYNAME to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Tata Industries Ltd')
  })

  it('maps GSTIN to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('27AABCT1332L1ZV')
  })

  it('maps ADDRESS to address.address1', () => {
    expect(transformOrganization(makeOrganization()).address?.address1).toBe('1 Corporate Park, Powai')
  })

  it('maps PINCODE to address.postalCode', () => {
    expect(transformOrganization(makeOrganization()).address?.postalCode).toBe('400076')
  })

  it('maps STATENAME to address.region', () => {
    expect(transformOrganization(makeOrganization()).address?.region).toBe('Maharashtra')
  })

  it('maps COUNTRYNAME to address.country', () => {
    expect(transformOrganization(makeOrganization()).address?.country).toBe('IN')
  })

  it('sets taxNumber to undefined when GSTIN is empty', () => {
    expect(transformOrganization(makeOrganization({ GSTIN: '' })).taxNumber).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
