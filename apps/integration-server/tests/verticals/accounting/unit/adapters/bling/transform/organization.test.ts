import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type BlingEmpresa,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<BlingEmpresa> = {}): BlingEmpresa {
  return {
    id: 'org-uuid-abc',
    nome: 'Empresa Exemplo Ltda',
    cnpj: '12.345.678/0001-90',
    email: 'fiscal@exemplo.com.br',
    ...overrides,
  }
}

describe('transformOrganization (bling)', () => {
  it('maps string id to string', () => {
    const result = transformOrganization(makeOrg({ id: 'uuid-123' }))
    expect(result.id).toBe('uuid-123')
  })

  it('maps numeric id to string', () => {
    const result = transformOrganization(makeOrg({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps nome to name', () => {
    const result = transformOrganization(makeOrg({ nome: 'My Company Ltda' }))
    expect(result.name).toBe('My Company Ltda')
  })

  it('maps cnpj to taxNumber', () => {
    const result = transformOrganization(makeOrg({ cnpj: '12.345.678/0001-90' }))
    expect(result.taxNumber).toBe('12.345.678/0001-90')
  })

  it('omits id when raw.id is null', () => {
    const result = transformOrganization(makeOrg({ id: undefined }))
    expect(result.id).toBeUndefined()
  })

  it('omits name when nome is absent', () => {
    const result = transformOrganization(makeOrg({ nome: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('omits taxNumber when cnpj is absent', () => {
    const result = transformOrganization(makeOrg({ cnpj: undefined }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('passes raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('result passes OrganizationSchema validation', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })

  it('result with empty input passes OrganizationSchema validation', () => {
    const result = transformOrganization({})
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
