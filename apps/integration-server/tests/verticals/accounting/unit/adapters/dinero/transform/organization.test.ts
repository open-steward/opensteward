import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DineroOrganization } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/organization'

function makeOrganization(overrides: Partial<DineroOrganization> = {}): DineroOrganization {
  return {
    Id: 12345,
    Name: 'Acme ApS',
    VatNumber: 'DK12345678',
    Address: 'Nørrebrogade 42',
    City: 'København',
    ZipCode: '2200',
    CountryKey: 'DK',
    Currency: 'DKK',
    Website: 'https://acme.dk',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps Id to id as string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('12345')
  })

  it('maps Name to name and legalName', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.name).toBe('Acme ApS')
    expect(o.legalName).toBe('Acme ApS')
  })

  it('maps VatNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('DK12345678')
  })

  it('maps Currency to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('DKK')
  })

  it('maps Website to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.dk')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Nørrebrogade 42')
    expect(o.address?.city).toBe('København')
    expect(o.address?.postalCode).toBe('2200')
    expect(o.address?.country).toBe('DK')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformOrganization(makeOrganization({ Name: '' })).name).toBeUndefined()
  })

  it('returns undefined website when Website is empty', () => {
    expect(transformOrganization(makeOrganization({ Website: '' })).website).toBeUndefined()
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
