import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type IfirmaAbonent,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<IfirmaAbonent> = {}): IfirmaAbonent {
  return {
    Login: 'jan.kowalski@example.com',
    NazwaFirmy: 'Kowalski Consulting Sp. z o.o.',
    NIP: '555-444-33-22',
    Ulica: 'ul. Nowy Świat 15',
    KodPocztowy: '00-029',
    Miejscowosc: 'Warszawa',
    Email: 'biuro@kowalski.pl',
    Telefon: '+48 22 987 6543',
    ...overrides,
  }
}

describe('transformOrganization (ifirma)', () => {
  it('maps Login to id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('jan.kowalski@example.com')
  })

  it('maps NazwaFirmy to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Kowalski Consulting Sp. z o.o.')
  })

  it('falls back to Login for name when NazwaFirmy is absent', () => {
    const result = transformOrganization(makeOrg({ NazwaFirmy: undefined }))
    expect(result.name).toBe('jan.kowalski@example.com')
  })

  it('maps NazwaFirmy to legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Kowalski Consulting Sp. z o.o.')
  })

  it('maps NIP to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('555-444-33-22')
  })

  it('builds address from Ulica and Miejscowosc', () => {
    const addr = transformOrganization(makeOrg()).address
    expect(addr?.address1).toBe('ul. Nowy Świat 15')
    expect(addr?.city).toBe('Warszawa')
    expect(addr?.postalCode).toBe('00-029')
    expect(addr?.country).toBe('PL')
  })

  it('omits address when both Ulica and Miejscowosc are absent', () => {
    const result = transformOrganization(makeOrg({ Ulica: undefined, Miejscowosc: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('produces a schema-valid Organization', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrg()))).not.toThrow()
  })
})
