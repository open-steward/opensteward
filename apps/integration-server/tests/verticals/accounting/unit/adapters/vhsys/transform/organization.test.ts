import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type VhsysEmpresa,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeEmpresa(overrides: Partial<VhsysEmpresa> = {}): VhsysEmpresa {
  return {
    id_empresa: 1,
    razao_empresa: 'Empresa Comercial Ltda',
    fantasia_empresa: 'EmpresaCom',
    cnpj_empresa: '12.345.678/0001-99',
    email_empresa: 'contato@empresa.com',
    fone_empresa: '+551132320001',
    site_empresa: 'https://empresa.com',
    endereco_empresa: 'Rua das Flores',
    numero_empresa: '100',
    cidade_empresa: 'São Paulo',
    uf_empresa: 'SP',
    cep_empresa: '01310-200',
    moeda_padrao: 'BRL',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeEmpresa())
    expect(result.id).toBe('1')
    expect(result.name).toBe('EmpresaCom')
    expect(result.legalName).toBe('Empresa Comercial Ltda')
    expect(result.taxNumber).toBe('12.345.678/0001-99')
    expect(result.currency).toBe('BRL')
    expect(result.website).toBe('https://empresa.com')
  })

  it('falls back to razao_empresa for name when fantasia absent', () => {
    const result = transformOrganization(makeEmpresa({ fantasia_empresa: undefined }))
    expect(result.name).toBe('Empresa Comercial Ltda')
  })

  it('defaults currency to BRL when absent', () => {
    const result = transformOrganization(makeEmpresa({ moeda_padrao: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('maps address block', () => {
    const result = transformOrganization(makeEmpresa())
    expect(result.address).toBeDefined()
    expect(result.address!.city).toBe('São Paulo')
    expect(result.address!.postalCode).toBe('01310-200')
    expect(result.address!.country).toBe('BR')
  })

  it('passes raw as metadata', () => {
    const raw = makeEmpresa()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrganization(makeEmpresa())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
