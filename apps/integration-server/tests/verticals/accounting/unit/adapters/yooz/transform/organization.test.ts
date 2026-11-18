import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type YoozOrgUnit,
} from '../../../../../../../src/verticals/accounting/adapters/yooz/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<YoozOrgUnit> = {}): YoozOrgUnit {
  return {
    id: 'org-1',
    name: 'Acme France',
    legalName: 'Acme France SAS',
    siret: '98765432101234',
    vatNumber: 'FR98765432101',
    currency: 'EUR',
    address: '5 Avenue des Champs',
    city: 'Paris',
    zipCode: '75008',
    countryCode: 'FR',
    ...overrides,
  }
}

describe('transformOrganization (yooz)', () => {
  it('maps id to string id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('org-1')
  })

  it('prefers name over legalName for name field', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme France')
  })

  it('prefers legalName over name for legalName field', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme France SAS')
  })

  it('prefers siret over vatNumber for taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('98765432101234')
  })

  it('falls back to vatNumber for taxNumber when siret absent', () => {
    expect(transformOrganization(makeRaw({ siret: undefined })).taxNumber).toBe('FR98765432101')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('EUR')
  })

  it('maps address fields when any address field is present', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('5 Avenue des Champs')
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.postalCode).toBe('75008')
    expect(result.address?.country).toBe('FR')
  })

  it('omits address when no address fields provided', () => {
    const result = transformOrganization(
      makeRaw({ address: undefined, city: undefined, zipCode: undefined, countryCode: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
