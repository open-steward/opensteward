import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PowerOfficeOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/organization'

function makeOrganization(overrides: Partial<PowerOfficeOrganization> = {}): PowerOfficeOrganization {
  return {
    id: 1,
    legalName: 'Acme AS',
    organizationNo: '987654321',
    currencyCode: 'NOK',
    countryCode: 'NO',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id correctly', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps legalName to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme AS')
  })

  it('maps legalName to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme AS')
  })

  it('maps organizationNo to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('987654321')
  })

  it('maps currencyCode to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('NOK')
  })

  it('maps countryCode to address.country', () => {
    expect(transformOrganization(makeOrganization()).address).toEqual({ country: 'NO' })
  })

  it('sets address to undefined when countryCode is empty', () => {
    expect(transformOrganization(makeOrganization({ countryCode: '' })).address).toBeUndefined()
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
