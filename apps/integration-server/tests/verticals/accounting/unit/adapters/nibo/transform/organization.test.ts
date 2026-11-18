import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type NiboOrganization } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/organization'

function makeRaw(overrides: Partial<NiboOrganization> = {}): NiboOrganization {
  return {
    companyName: 'Empresa SA',
    tradeName: 'Empresa',
    cnpj: '12.345.678/0001-99',
    stateRegistration: 'SP-123456',
    street: 'Avenida Paulista',
    complement: '',
    city: 'São Paulo',
    zipCode: '01310-100',
    state: 'SP',
    country: 'BR',
    email: 'info@empresa.com.br',
    phone: '1134567890',
    website: 'https://empresa.com.br',
    currencyCode: 'BRL',
    ...overrides,
  }
}

describe('nibo transformOrganization', () => {
  it('maps tradeName to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Empresa')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('maps cnpj to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('12.345.678/0001-99')
  })
  it('maps companyName to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Empresa SA')
  })
  it('maps currencyCode to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('BRL')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
