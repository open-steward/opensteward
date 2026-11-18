import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type OctopusDossier,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<OctopusDossier> = {}): OctopusDossier {
  return {
    dossierId: 1001,
    dossierName: 'Acme Dossier',
    companyName: 'Acme BVBA',
    vatNumber: 'BE0123456789',
    currency: 'EUR',
    address: 'Grote Markt 1',
    city: 'Ghent',
    postalCode: '9000',
    countryCode: 'BE',
    fiscalYearEndMonth: 12,
    timezone: 'Europe/Brussels',
    ...overrides,
  }
}

describe('transformOrganization (octopus)', () => {
  it('maps dossierId to id (string)', () => {
    expect(transformOrganization(makeRaw()).id).toBe('1001')
  })

  it('maps companyName to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme BVBA')
  })

  it('maps companyName to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme BVBA')
  })

  it('falls back to dossierName when companyName absent', () => {
    const org = transformOrganization(makeRaw({ companyName: undefined }))
    expect(org.name).toBe('Acme Dossier')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('BE0123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('EUR')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeRaw()).timezone).toBe('Europe/Brussels')
  })

  it('maps fiscalYearEndMonth', () => {
    expect(transformOrganization(makeRaw()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address city', () => {
    expect(transformOrganization(makeRaw()).address?.city).toBe('Ghent')
  })

  it('maps countryCode to address country', () => {
    expect(transformOrganization(makeRaw()).address?.country).toBe('BE')
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
