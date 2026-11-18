import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AccountsIQOrganization } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/organization'

function makeOrganization(overrides: Partial<AccountsIQOrganization> = {}): AccountsIQOrganization {
  return {
    entityId: '10',
    companyName: 'AccountsIQ Demo Ltd',
    taxNumber: 'IE8765432F',
    registrationNumber: 'CRO654321',
    email: 'finance@demo.ie',
    phone: '+353 1 800 1234',
    addressLine1: '10 Burlington Road',
    addressLine2: '',
    city: 'Dublin',
    postCode: 'D04 RD68',
    country: 'IE',
    ...overrides,
  }
}

describe('transformOrganization (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('AccountsIQ Demo Ltd')
    expect(result.legalName).toBe('AccountsIQ Demo Ltd')
    expect(result.taxNumber).toBe('IE8765432F')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('10 Burlington Road')
    expect(result.address?.city).toBe('Dublin')
    expect(result.address?.postalCode).toBe('D04 RD68')
    expect(result.address?.country).toBe('IE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
