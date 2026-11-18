import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ContaAzulCompanyInfo } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/organization'

function makeOrganization(overrides: Partial<ContaAzulCompanyInfo> = {}): ContaAzulCompanyInfo {
  return {
    id: 'org-001',
    name: 'Joao Santos',
    company_name: 'Santos Comercio Ltda',
    cnpj: '12.345.678/0001-90',
    address: 'Av Brasil 2000',
    complement: 'Andar 5',
    city: 'Rio de Janeiro',
    state: 'RJ',
    postal_code: '20040-020',
    country: 'BR',
    email: 'contato@santos.com.br',
    phone: '2132345678',
    website: 'https://santos.com.br',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.id).toBe('org-001')
    expect(result.name).toBe('Santos Comercio Ltda')
    expect(result.legalName).toBe('Santos Comercio Ltda')
    expect(result.taxNumber).toBe('12.345.678/0001-90')
    expect(result.currency).toBe('BRL')
    expect(result.website).toBe('https://santos.com.br')
  })

  it('maps address fields with complement', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Av Brasil 2000')
    expect(result.address?.address2).toBe('Andar 5')
    expect(result.address?.city).toBe('Rio de Janeiro')
    expect(result.address?.region).toBe('RJ')
    expect(result.address?.postalCode).toBe('20040-020')
    expect(result.address?.country).toBe('BR')
  })

  it('falls back to name when company_name is empty', () => {
    const result = transformOrganization(makeOrganization({ company_name: '' }))
    expect(result.name).toBe('Joao Santos')
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
