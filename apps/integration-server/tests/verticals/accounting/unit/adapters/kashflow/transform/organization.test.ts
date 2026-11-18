import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type KashflowSettings,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeSettings(overrides: Partial<KashflowSettings> = {}): KashflowSettings {
  return {
    CompanyName: 'Acme Industries Ltd',
    PrimaryContact: 'Jane Doe',
    Telephone: '01234 567890',
    VATRegistered: true,
    HomeCurrency: { Code: 'GBP', Symbol: '£' },
    Address: {
      Line1: '1 High Street',
      Line2: 'Apt 2',
      Line3: 'London',
      Line4: 'Greater London',
      PostCode: 'EC1A 1BB',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name', () => {
    expect(transformOrganization(makeSettings({ CompanyName: 'Acme Industries Ltd' })).name).toBe(
      'Acme Industries Ltd',
    )
  })

  it('maps CompanyName to legalName', () => {
    expect(
      transformOrganization(makeSettings({ CompanyName: 'Acme Industries Ltd' })).legalName,
    ).toBe('Acme Industries Ltd')
  })

  it('maps HomeCurrency.Code to currency', () => {
    expect(transformOrganization(makeSettings({ HomeCurrency: { Code: 'GBP' } })).currency).toBe(
      'GBP',
    )
  })

  it('maps Address.Line1 to address.address1', () => {
    expect(transformOrganization(makeSettings()).address?.address1).toBe('1 High Street')
  })

  it('maps Address.Line2 to address.address2', () => {
    expect(transformOrganization(makeSettings()).address?.address2).toBe('Apt 2')
  })

  it('maps Address.Line3 to address.city', () => {
    expect(transformOrganization(makeSettings()).address?.city).toBe('London')
  })

  it('maps Address.Line4 to address.region', () => {
    expect(transformOrganization(makeSettings()).address?.region).toBe('Greater London')
  })

  it('maps Address.PostCode to address.postalCode', () => {
    expect(transformOrganization(makeSettings()).address?.postalCode).toBe('EC1A 1BB')
  })

  it('does not include a country field (KashFlow settings have no country)', () => {
    // The organization schema address has no country in the KashFlow mapping
    expect(transformOrganization(makeSettings()).address?.country).toBeUndefined()
  })

  it('does not set an id field', () => {
    expect(transformOrganization(makeSettings()).id).toBeUndefined()
  })

  it('sets name to undefined when CompanyName is absent', () => {
    const result = transformOrganization(makeSettings({ CompanyName: undefined }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('sets currency to undefined when HomeCurrency is absent', () => {
    expect(
      transformOrganization(makeSettings({ HomeCurrency: undefined })).currency,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeSettings()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    const result = transformOrganization(makeSettings())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
