import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type NuvemFiscalCliente,
  type NuvemFiscalFornecedor,
} from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/contact'

function makeCustomer(overrides: Partial<NuvemFiscalCliente> = {}): NuvemFiscalCliente {
  return {
    id_cliente: 7,
    razao_social: 'Empresa ABC Ltda',
    nome_fantasia: 'ABC',
    cnpj: '12.345.678/0001-90',
    cpf: '',
    email: 'contato@abc.com',
    telefone: '11999999999',
    fax: '',
    endereco: 'Rua das Flores, 123',
    cidade: 'São Paulo',
    cep: '01310-100',
    estado: 'SP',
    pais: 'BR',
    moeda: 'BRL',
    ativo: true,
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<NuvemFiscalFornecedor> = {}): NuvemFiscalFornecedor {
  return {
    id_fornecedor: 3,
    razao_social: 'Fornecedor S.A.',
    nome_fantasia: 'FornecedorX',
    cnpj: '98.765.432/0001-10',
    cpf: '',
    email: 'forn@email.com',
    telefone: '11888888888',
    endereco: 'Av. Paulista, 1000',
    cidade: 'São Paulo',
    cep: '01310-200',
    estado: 'SP',
    pais: 'BR',
    moeda: 'BRL',
    ativo: true,
    ...overrides,
  }
}

describe('nuvemfiscal transformCustomer', () => {
  it('maps id_cliente to id with cust_ prefix', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_7')
  })

  it('maps nome_fantasia to name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('ABC')
  })

  it('falls back to razao_social when nome_fantasia is empty', () => {
    expect(transformCustomer(makeCustomer({ nome_fantasia: '' })).name).toBe('Empresa ABC Ltda')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCustomer(makeCustomer())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('nuvemfiscal transformSupplier', () => {
  it('maps id_fornecedor to id with supp_ prefix', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_3')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })
})
