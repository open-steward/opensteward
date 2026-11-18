import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type IpaidthatOrganization } from '../../../../../../../src/verticals/accounting/adapters/ipaidthat/transform/organization'

function makeOrganization(overrides: Partial<IpaidthatOrganization> = {}): IpaidthatOrganization {
  return {
    id: '1',
    nom: 'StartupFR',
    raison_sociale: 'StartupFR SAS',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    adresse: '50 Rue du Faubourg',
    code_postal: '75011',
    ville: 'Paris',
    pays: 'FR',
    email: 'info@startupfr.fr',
    telephone: '0123456789',
    site_web: 'https://startupfr.fr',
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('StartupFR')
    expect(result.legalName).toBe('StartupFR SAS')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.country).toBe('FR')
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
