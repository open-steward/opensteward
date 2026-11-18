import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type OmieContact } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/contact'

function makeRaw(overrides: Partial<OmieContact> = {}): OmieContact {
  return {
    codigo_cliente: 15,
    razao_social: 'Empresa ABC',
    nome_fantasia: 'ABC',
    cnpj_cpf: '12.345.678/0001-90',
    inscricao_estadual: 'IE-001',
    email: 'abc@empresa.com',
    telefone1_numero: '999999999',
    telefone1_ddd: '11',
    telefone2_numero: '',
    telefone2_ddd: '',
    endereco: 'Rua A',
    endereco_numero: '10',
    complemento: 'Sala 1',
    bairro: 'Centro',
    cidade: 'São Paulo',
    cep: '01310-100',
    estado: 'SP',
    codigo_pais: 'BR',
    inativo: 'N',
    ...overrides,
  }
}

describe('omie transformContact', () => {
  it('maps codigo_cliente to id as string', () => {
    expect(transformContact(makeRaw()).id).toBe('15')
  })

  it('maps razao_social to name', () => {
    expect(transformContact(makeRaw()).name).toBe('Empresa ABC')
  })

  it('maps cnpj_cpf to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('12.345.678/0001-90')
  })

  it('maps inativo=N to isActive=true', () => {
    expect(transformContact(makeRaw({ inativo: 'N' })).isActive).toBe(true)
  })

  it('maps inativo=S to isActive=false', () => {
    expect(transformContact(makeRaw({ inativo: 'S' })).isActive).toBe(false)
  })

  it('sets isCustomer=true', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
