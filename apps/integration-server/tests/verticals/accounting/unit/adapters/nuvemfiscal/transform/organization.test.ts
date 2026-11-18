import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type NuvemFiscalEmpresa } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/organization'

function makeRaw(overrides: Partial<NuvemFiscalEmpresa> = {}): NuvemFiscalEmpresa {
  return {
    razao_social: 'Empresa XPTO Ltda',
    nome_fantasia: 'XPTO',
    cnpj: '11.222.333/0001-44',
    moeda: 'BRL',
    site: 'https://xpto.com',
    endereco: 'Rua Central, 1',
    cidade: 'Curitiba',
    cep: '80010-010',
    estado: 'PR',
    pais: 'BR',
    ...overrides,
  }
}

describe('nuvemfiscal transformOrganization', () => {
  it('maps nome_fantasia to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('XPTO')
  })

  it('maps razao_social to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Empresa XPTO Ltda')
  })

  it('maps cnpj to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('11.222.333/0001-44')
  })

  it('maps moeda to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('BRL')
  })

  it('maps site to website', () => {
    expect(transformOrganization(makeRaw()).website).toBe('https://xpto.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
