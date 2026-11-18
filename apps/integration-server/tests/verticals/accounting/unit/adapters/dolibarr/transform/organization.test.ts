import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DolibarrCompany } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/organization'

function makeRaw(overrides: Partial<DolibarrCompany> = {}): DolibarrCompany {
  return {
    id: 1,
    name: 'Ma Société SAS',
    address: '1 Avenue des Champs-Élysées',
    zip: '75008',
    town: 'Paris',
    country_code: 'FR',
    tva_intra: 'FR98765432100',
    multicurrency_code: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('Ma Société SAS')
    expect(result.legalName).toBe('Ma Société SAS')
    expect(result.taxNumber).toBe('FR98765432100')
    expect(result.currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('1 Avenue des Champs-Élysées')
    expect(result.address?.postalCode).toBe('75008')
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.country).toBe('FR')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
