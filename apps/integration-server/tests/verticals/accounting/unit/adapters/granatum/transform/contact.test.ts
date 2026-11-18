import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type GranatumPessoa,
} from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<GranatumPessoa> = {}): GranatumPessoa {
  return {
    id: 12,
    nome: 'Empresa Exemplo Ltda',
    nome_fantasia: 'Exemplo',
    documento: '12.345.678/0001-90',
    inscricao_estadual: 'IE-SP-1234',
    inscricao_municipal: null,
    telefone: '(11) 98765-4321',
    email: 'contato@exemplo.com.br',
    endereco: 'Rua das Flores',
    endereco_numero: '100',
    endereco_complemento: 'Sala 5',
    bairro: 'Centro',
    cep: '01310-100',
    cidade_id: 1,
    estado_id: 35,
    ativo: true,
    cliente: true,
    fornecedor: false,
    estrangeiro: false,
    estado: { sigla: 'SP' },
    cidade: { nome: 'São Paulo' },
    ...overrides,
  }
}

describe('transformContact (granatum)', () => {
  it('maps id as string', () => {
    expect(transformContact(makeContact()).id).toBe('12')
  })

  it('prefers nome_fantasia over nome for name', () => {
    expect(transformContact(makeContact()).name).toBe('Exemplo')
  })

  it('uses nome for name when nome_fantasia is null', () => {
    const result = transformContact(makeContact({ nome_fantasia: null }))
    expect(result.name).toBe('Empresa Exemplo Ltda')
  })

  it('maps nome to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Empresa Exemplo Ltda')
  })

  it('maps documento to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('12.345.678/0001-90')
  })

  it('maps inscricao_estadual to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('IE-SP-1234')
  })

  it('maps cliente to isCustomer', () => {
    expect(transformContact(makeContact({ cliente: true })).isCustomer).toBe(true)
  })

  it('maps fornecedor to isSupplier', () => {
    expect(transformContact(makeContact({ fornecedor: false })).isSupplier).toBe(false)
  })

  it('maps ativo to isActive', () => {
    expect(transformContact(makeContact({ ativo: false })).isActive).toBe(false)
  })

  it('composes address1 from endereco and endereco_numero', () => {
    const addr = transformContact(makeContact()).billingAddress
    expect(addr?.address1).toBe('Rua das Flores, 100')
  })

  it('maps estado.sigla to address region', () => {
    expect(transformContact(makeContact()).billingAddress?.region).toBe('SP')
  })

  it('maps cidade.nome to address city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('São Paulo')
  })

  it('sets country BR for domestic contacts', () => {
    expect(transformContact(makeContact({ estrangeiro: false })).billingAddress?.country).toBe('BR')
  })

  it('omits country for foreign contacts', () => {
    expect(
      transformContact(makeContact({ estrangeiro: true })).billingAddress?.country,
    ).toBeUndefined()
  })

  it('maps email', () => {
    const emails = transformContact(makeContact()).emails
    expect(emails?.[0]?.email).toBe('contato@exemplo.com.br')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })
})
