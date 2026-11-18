import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type IntacctOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/organization'

function makeOrganization(overrides: Partial<IntacctOrganization> = {}): IntacctOrganization {
  return {
    RECORDNO: 'org-1',
    COMPANYNAME: 'Acme Corp',
    LEGALNAME: 'Acme Corporation Ltd',
    TAXID: 'TX-12345',
    CURRENCY: 'USD',
    ADDRESS1: '123 Main St',
    CITY: 'Springfield',
    STATE: 'IL',
    ZIP: '62701',
    COUNTRY: 'US',
    PHONE1: '+1-555-0100',
    EMAIL1: 'info@acme.com',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps RECORDNO to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps COMPANYNAME to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corp')
  })

  it('maps LEGALNAME to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Corporation Ltd')
  })

  it('falls back to COMPANYNAME for legalName when LEGALNAME is empty', () => {
    expect(
      transformOrganization(makeOrganization({ LEGALNAME: '' })).legalName,
    ).toBe('Acme Corp')
  })

  it('maps TAXID to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('TX-12345')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps address fields correctly', () => {
    expect(transformOrganization(makeOrganization()).address).toEqual({
      address1: '123 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    })
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
