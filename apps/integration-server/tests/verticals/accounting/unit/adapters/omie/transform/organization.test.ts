import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type OmieOrganization } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/organization'

function makeRaw(overrides: Partial<OmieOrganization> = {}): OmieOrganization {
  return {
    razao_social: 'Omie Tech Ltda',
    nome_fantasia: 'OmieTech',
    cnpj: '33.444.555/0001-66',
    inscricao_estadual: 'IE-333',
    endereco: 'Av. Brigadeiro',
    complemento: 'Andar 10',
    cidade: 'São Paulo',
    cep: '04538-132',
    estado: 'SP',
    pais: 'BR',
    email: 'contact@omie.com',
    telefone: '11988888888',
    site: 'https://omie.com',
    moeda: 'BRL',
    ...overrides,
  }
}

describe('omie transformOrganization', () => {
  it('maps nome_fantasia to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('OmieTech')
  })

  it('falls back to razao_social when nome_fantasia is empty', () => {
    expect(transformOrganization(makeRaw({ nome_fantasia: '' })).name).toBe('Omie Tech Ltda')
  })

  it('maps razao_social to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Omie Tech Ltda')
  })

  it('maps cnpj to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('33.444.555/0001-66')
  })

  it('maps moeda to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('BRL')
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
