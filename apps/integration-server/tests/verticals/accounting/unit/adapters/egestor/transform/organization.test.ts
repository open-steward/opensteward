import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type EgestorEmpresa,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<EgestorEmpresa> = {}): EgestorEmpresa {
  return {
    subdom: 'minha-empresa',
    nome: 'Minha Empresa Ltda',
    fantasia: 'Minha Empresa',
    cpfcnpj: '12.345.678/0001-99',
    end: 'Rua das Flores',
    num: '200',
    bairro: 'Centro',
    cidadeNome: 'São Paulo',
    uf: 'SP',
    cep: '01310-100',
    ...overrides,
  }
}

describe('egestor transformOrganization', () => {
  it('id is not set (no subdom mapping to id in transform)', () => {
    // eGestor organization transform does not map subdom to id
    const result = transformOrganization(makeRaw())
    expect(result.id).toBeUndefined()
  })

  it('uses fantasia as name when present', () => {
    const result = transformOrganization(makeRaw({ fantasia: 'Brand', nome: 'Legal' }))
    expect(result.name).toBe('Brand')
  })

  it('falls back to nome when fantasia absent', () => {
    const result = transformOrganization(makeRaw({ fantasia: undefined, nome: 'Legal Name' }))
    expect(result.name).toBe('Legal Name')
  })

  it('maps nome to legalName', () => {
    const result = transformOrganization(makeRaw({ nome: 'Legal Name Ltda' }))
    expect(result.legalName).toBe('Legal Name Ltda')
  })

  it('maps cpfcnpj to taxNumber', () => {
    const result = transformOrganization(makeRaw({ cpfcnpj: '12.345.678/0001-99' }))
    expect(result.taxNumber).toBe('12.345.678/0001-99')
  })

  it('builds address1 from end + num', () => {
    const result = transformOrganization(makeRaw({ end: 'Av. Paulista', num: '1000' }))
    expect(result.address?.address1).toBe('Av. Paulista, 1000')
  })

  it('country is always BR', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.country).toBe('BR')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
