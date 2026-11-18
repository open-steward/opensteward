import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type AfasEmployer,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<AfasEmployer> = {}): AfasEmployer {
  return {
    EmId: 'EM-001',
    EmName: 'Acme Holding BV',
    EmAddress: 'Herengracht 10',
    EmPostalCode: '1015 BL',
    EmCity: 'Amsterdam',
    EmCountryIso: 'NL',
    EmPhone: '+31201234567',
    EmEmail: 'info@acme.nl',
    EmCocNr: 'KVK12345678',
    EmVatNr: 'NL123456789B01',
    EmCurrency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('Acme Holding BV')
    expect(result.legalName).toBe('Acme Holding BV')
    expect(result.currency).toBe('EUR')
    // EmVatNr takes precedence over EmCocNr for taxNumber
    expect(result.taxNumber).toBe('NL123456789B01')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('Herengracht 10')
    expect(result.address?.city).toBe('Amsterdam')
    expect(result.address?.postalCode).toBe('1015 BL')
    expect(result.address?.country).toBe('NL')
  })

  it('falls back to EmCocNr when EmVatNr is empty', () => {
    const result = transformOrganization(makeRaw({ EmVatNr: '' }))
    expect(result.taxNumber).toBe('KVK12345678')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
