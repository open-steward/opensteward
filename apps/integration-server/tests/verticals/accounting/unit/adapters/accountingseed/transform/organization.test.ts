import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type AccountingSeedOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/organization'

function makeOrganization(overrides: Partial<AccountingSeedOrganization> = {}): AccountingSeedOrganization {
  return {
    Id: '0015e000007STU1',
    Name: 'Acme Corporation',
    AcctSeed__Legal_Name__c: 'Acme Corporation Inc.',
    AcctSeed__Organization_Code__c: 'ACME',
    AcctSeed__Tax_Id__c: '12-3456789',
    CurrencyIsoCode: 'USD',
    AcctSeed__Timezone__c: 'America/New_York',
    Website: 'https://acme.com',
    AcctSeed__Fiscal_Year_End_Month__c: 12,
    BillingStreet: '100 Corporate Dr',
    BillingCity: 'New York',
    BillingState: 'NY',
    BillingPostalCode: '10001',
    BillingCountry: 'US',
    CreatedDate: '2023-01-01T00:00:00.000Z',
    LastModifiedDate: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from Id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('0015e000007STU1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corporation')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Corporation Inc.')
  })

  it('maps organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('ACME')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('12-3456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrganization()).timezone).toBe('America/New_York')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.com')
  })

  it('maps fiscalYearEndMonth', () => {
    expect(transformOrganization(makeOrganization()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('100 Corporate Dr')
    expect(result.address?.city).toBe('New York')
    expect(result.address?.region).toBe('NY')
    expect(result.address?.postalCode).toBe('10001')
    expect(result.address?.country).toBe('US')
  })

  it('returns undefined address when no billing fields', () => {
    const result = transformOrganization(makeOrganization({
      BillingStreet: '',
      BillingCity: '',
    }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
