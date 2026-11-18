import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FattureCloudCompany } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/organization'

function makeOrg(overrides: Partial<FattureCloudCompany> = {}): FattureCloudCompany {
  return { name: 'Azienda SRL', vat_number: 'IT01234567890', currency: { id: 'EUR' }, address_city: 'Milano', address_country: 'IT', ...overrides }
}

describe('transformOrganization (fatturecloud)', () => {
  it('maps name', () => { expect(transformOrganization(makeOrg()).name).toBe('Azienda SRL') })
  it('maps taxNumber from vat_number', () => { expect(transformOrganization(makeOrg()).taxNumber).toBe('IT01234567890') })
  it('maps currency', () => { expect(transformOrganization(makeOrg()).currency).toBe('EUR') })
  it('maps address', () => {
    const r = transformOrganization(makeOrg({ address_street: 'Via Roma 1', address_city: 'Milano' }))
    expect(r.address?.city).toBe('Milano')
    expect(r.address?.address1).toBe('Via Roma 1')
  })
  it('fiscal_code fallback for taxNumber', () => {
    expect(transformOrganization(makeOrg({ vat_number: undefined, fiscal_code: 'FC123' })).taxNumber).toBe('FC123')
  })
  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
