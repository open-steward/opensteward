import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type TiimeOrganization } from '../../../../../../../src/verticals/accounting/adapters/tiime/transform/organization'

function makeOrganization(overrides: Partial<TiimeOrganization> = {}): TiimeOrganization {
  return {
    id: '1',
    nom: 'Ma Société',
    raison_sociale: 'Ma Société SAS',
    siret: '12345678900012',
    numero_tva: 'FR12345678900',
    adresse: '10 Avenue des Champs-Élysées',
    code_postal: '75008',
    ville: 'Paris',
    pays: 'FR',
    email: 'contact@masociete.fr',
    telephone: '0123456789',
    site_web: 'https://masociete.fr',
    devise: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Ma Société')
    expect(result.legalName).toBe('Ma Société SAS')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://masociete.fr')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('10 Avenue des Champs-Élysées')
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.postalCode).toBe('75008')
    expect(result.address?.country).toBe('FR')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const result = transformOrganization(makeOrganization({ site_web: '', devise: '' }))
    expect(result.website).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
