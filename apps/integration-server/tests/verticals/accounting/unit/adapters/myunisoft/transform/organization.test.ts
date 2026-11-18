import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MyunisoftOrganization } from '../../../../../../../src/verticals/accounting/adapters/myunisoft/transform/organization'

function makeOrganization(overrides: Partial<MyunisoftOrganization> = {}): MyunisoftOrganization {
  return {
    id: '1',
    nom: 'Cabinet Dubois',
    raison_sociale: 'Cabinet Dubois SAS',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    adresse: '3 Rue Réaumur',
    code_postal: '75003',
    ville: 'Paris',
    pays: 'FR',
    email: 'dubois@cabinet.fr',
    telephone: '0123456789',
    site_web: 'https://cabinet-dubois.fr',
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Cabinet Dubois')
    expect(result.legalName).toBe('Cabinet Dubois SAS')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('3 Rue Réaumur')
    expect(result.address?.city).toBe('Paris')
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
