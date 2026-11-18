import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SellsyOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/organization'

function makeOrganization(overrides: Partial<SellsyOrganization> = {}): SellsyOrganization {
  return {
    id: 'org-001',
    name: 'Dupont SARL',
    legal_name: 'Dupont Société à Responsabilité Limitée',
    siret: '12345678901234',
    vat_number: 'FR12345678901',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    website: 'https://dupont.fr',
    address_line_1: '10 Rue de la Paix',
    address_line_2: 'Bureau 201',
    city: 'Paris',
    postal_code: '75002',
    country: 'FR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Dupont SARL')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe(
      'Dupont Société à Responsabilité Limitée',
    )
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('FR12345678901')
  })

  it('falls back to siret for taxNumber when vat_number is empty', () => {
    expect(
      transformOrganization(makeOrganization({ vat_number: '' })).taxNumber,
    ).toBe('12345678901234')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrganization()).timezone).toBe('Europe/Paris')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://dupont.fr')
  })

  it('maps address fields', () => {
    const org = transformOrganization(makeOrganization())
    expect(org.address?.address1).toBe('10 Rue de la Paix')
    expect(org.address?.address2).toBe('Bureau 201')
    expect(org.address?.city).toBe('Paris')
    expect(org.address?.postalCode).toBe('75002')
    expect(org.address?.country).toBe('FR')
  })

  it('returns undefined name when empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined website when empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
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
